/**
 * QR-Based Digital ID & Entry Logger
 * Validation.gs — Core Business Logic
 *
 * Handles: Scan validation, IN/OUT detection, duplicate prevention,
 *          entry logging, summary generation, concurrent scan safety.
 */

// ─── MAIN VALIDATION PIPELINE ────────────────────────────────────────────────

/**
 * Main entry point called from doPost when action = "scan".
 * Runs the full validation pipeline with lock protection.
 *
 * @param {object} data - { qrPayload: string (JSON or raw UID) }
 * @returns {object}    - { success, status, message, userInfo }
 */
function validateAndLog(data) {
  // Step 1: Parse QR payload
  let parsed;
  let userId;

  try {
    if (typeof data.qrPayload === "string") {
      try { parsed = JSON.parse(data.qrPayload); userId = parsed.uid; }
      catch (_) { userId = data.qrPayload.trim(); }
    } else if (typeof data.qrPayload === "object") {
      parsed = data.qrPayload; userId = parsed.uid;
    } else {
      userId = String(data.qrPayload).trim();
    }
  } catch (e) {
    return { success: false, errorCode: "INVALID_QR", message: "QR code contains invalid data. Please use a registered QR." };
  }

  const scanAgent = data.scanAgent || "web-scanner";
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    return { success: false, errorCode: "MISSING_UID", message: "No valid User ID found in QR code." };
  }

  // Steps 2+3: Slow READ-ONLY checks run OUTSIDE the lock.
  // Multiple scanner stations can execute these simultaneously.
  const userInfo = lookupUser(userId);
  if (!userInfo) {
    return { success: false, errorCode: "USER_NOT_FOUND", message: `User ID "${userId}" is not registered in the system.` };
  }

  const dupCheck = isDuplicateRapidScan(userId);
  if (dupCheck.isDuplicate) {
    return {
      success: false, errorCode: "DUPLICATE_SCAN",
      message: `Scan already recorded ${dupCheck.secondsAgo}s ago. Please wait ${CONFIG.RAPID_SCAN_SECONDS - dupCheck.secondsAgo}s.`,
      userInfo
    };
  }

  // Critical section: lock held for ~50ms only (detectInOut + writeLogEntry).
  // Different users processed on parallel scanners barely block each other.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (_) {
    return { success: false, errorCode: "SERVER_BUSY", message: "Server is busy. Please try again immediately." };
  }

  try {
    // Re-check duplicate inside lock (prevents same-user race condition)
    const dupCheckFinal = isDuplicateRapidScan(userId);
    if (dupCheckFinal.isDuplicate) {
      return {
        success: false, errorCode: "DUPLICATE_SCAN",
        message: `Scan already recorded ${dupCheckFinal.secondsAgo}s ago. Please wait ${CONFIG.RAPID_SCAN_SECONDS - dupCheckFinal.secondsAgo}s.`,
        userInfo
      };
    }

    const status   = detectInOut(userId);
    const logEntry = writeLogEntry(userId, userInfo.Name, status, scanAgent);
    updateDailySummary(status);

    return {
      success: true, status,
      message: `${userInfo.Name} marked ${status} successfully.`,
      userInfo: { userId: userInfo.UserID, name: userInfo.Name, role: userInfo.Role, timestamp: logEntry.timestamp }
    };
  } finally {
    lock.releaseLock();
  }
}

// ─── USER LOOKUP ──────────────────────────────────────────────────────────────

/**
 * Looks up a user by ID in the Users sheet.
 * Returns the user object or null if not found.
 */
function lookupUser(userId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return null;

  const headers = data[0]; // ["UserID","Name","Email","Role","QR_DriveLink","CreatedAt"]
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(userId).trim()) {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = data[i][idx]; });
      return obj;
    }
  }
  return null;
}

// ─── DUPLICATE SCAN DETECTION ─────────────────────────────────────────────────

/**
 * Checks if the same user scanned within the rapid-scan window.
 * @returns {{ isDuplicate: boolean, secondsAgo: number }}
 */
function isDuplicateRapidScan(userId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const last  = sheet.getLastRow();

  if (last <= 1) return { isDuplicate: false };

  // Scan backwards through last 20 rows for efficiency
  const startRow = Math.max(2, last - 19);
  const rows     = sheet.getRange(startRow, 1, last - startRow + 1, 6).getValues();

  const now = new Date();
  for (let i = rows.length - 1; i >= 0; i--) {
    const rowUserId    = String(rows[i][1]).trim();
    const rawTs        = rows[i][3];
    let rowTimestamp;
    if (rawTs instanceof Date) {
      rowTimestamp = rawTs;
    } else {
      const ts = String(rawTs);
      const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
      if (m) {
        // new Date(year, monthIndex, day, hours, minutes, seconds)
        rowTimestamp = new Date(m[3], m[2] - 1, m[1], m[4], m[5], m[6]);
      } else {
        rowTimestamp = new Date(ts);
      }
    }

    if (rowUserId === String(userId).trim()) {
      const secondsAgo = Math.floor((now - rowTimestamp) / 1000);
      if (secondsAgo < CONFIG.RAPID_SCAN_SECONDS) {
        return { isDuplicate: true, secondsAgo };
      }
      break; // found the last scan for this user — no need to go further
    }
  }
  return { isDuplicate: false };
}

// ─── IN / OUT DETECTION ───────────────────────────────────────────────────────

/**
 * Reads the last log entry for a user and toggles IN/OUT.
 * Rules:
 *   - No previous log  → IN
 *   - Last was IN      → OUT
 *   - Last was OUT     → IN
 */
function detectInOut(userId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const last  = sheet.getLastRow();

  if (last <= 1) return "IN";

  // Read backwards through logs to find last entry for this user
  const startRow = Math.max(2, last - 200); // limit scan range
  const rows     = sheet.getRange(startRow, 1, last - startRow + 1, 6).getValues();

  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]).trim() === String(userId).trim()) {
      const lastStatus = String(rows[i][4]).trim().toUpperCase();
      return lastStatus === "IN" ? "OUT" : "IN";
    }
  }
  return "IN"; // no prior log found
}

// ─── LOG WRITER ───────────────────────────────────────────────────────────────

/**
 * Appends a new row to the Logs sheet.
 * @returns {{ logId, timestamp }}
 */
function writeLogEntry(userId, name, status, scanAgent) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);

  const logId     = sheet.getLastRow(); // auto-increment = row number
  const timestamp = new Date();
  const IST_TZ    = "Asia/Kolkata";

  // Write timestamp as a human-readable IST string so the sheet shows IST time
  const istString = Utilities.formatDate(timestamp, IST_TZ, "yyyy-MM-dd HH:mm:ss");
  // Also keep ISO for machine-readable usage (returned to frontend)
  const isoString = timestamp.toISOString();

  sheet.appendRow([
    logId,
    userId,
    name,
    istString,   // ← IST time in the sheet
    status,
    scanAgent || "web-scanner"
  ]);

  return { logId, timestamp: isoString };
}

// ─── SUMMARY ──────────────────────────────────────────────────────────────────

/**
 * Updates today's row in the Summary sheet.
 */
function updateDailySummary(newStatus) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SUMMARY);
  const tz    = Session.getScriptTimeZone();
  const today = new Date();
  const dateStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  const data = sheet.getDataRange().getValues();

  // Find today's row — normalize cell value to string before comparing
  // (Sheets may store the date as a Date object, not a plain string)
  for (let i = 1; i < data.length; i++) {
    const cellRaw = data[i][0];
    const cellStr = cellRaw instanceof Date
      ? Utilities.formatDate(cellRaw, tz, "yyyy-MM-dd")
      : String(cellRaw).trim();

    if (cellStr === dateStr) {
      const inCount  = Number(data[i][1]) || 0;
      const outCount = Number(data[i][2]) || 0;
      if (newStatus === "IN") {
        sheet.getRange(i + 1, 2).setValue(inCount + 1);
      } else {
        sheet.getRange(i + 1, 3).setValue(outCount + 1);
      }
      updateUniqueSummary(sheet, i + 1, dateStr);
      return;
    }
  }

  // Today not found — create new row
  sheet.appendRow([
    dateStr,
    newStatus === "IN" ? 1 : 0,
    newStatus === "OUT" ? 1 : 0,
    1
  ]);
  updateUniqueSummary(sheet, sheet.getLastRow(), dateStr);
}

/**
 * Recalculates unique users for a given date in the Summary sheet.
 */
function updateUniqueSummary(sheet, summaryRow, dateStr) {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const logsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const logs      = logsSheet.getDataRange().getValues();
  const tz        = Session.getScriptTimeZone();

  const uniqueIds = new Set();
  logs.slice(1).forEach(row => {
    const tsRaw = row[3];
    let tsStr = "";
    if (tsRaw instanceof Date) {
      tsStr = Utilities.formatDate(tsRaw, "Asia/Kolkata", "yyyy-MM-dd");
    } else {
      const ts = String(tsRaw);
      const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        tsStr = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      } else {
        tsStr = ts.substring(0, 10);
      }
    }
    if (tsStr === dateStr) {
      uniqueIds.add(String(row[1]).trim());
    }
  });

  sheet.getRange(summaryRow, 4).setValue(uniqueIds.size);
}

/**
 * Returns attendance summary computed LIVE from the Logs sheet.
 * Bypasses the Summary sheet entirely to avoid stale/duplicate data.
 */
function getAttendanceSummary() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const logsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const usersSheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  const tz        = Session.getScriptTimeZone();
  const logs      = logsSheet.getDataRange().getValues();

  if (logs.length <= 1) return { success: true, summary: [] };

  // Build per-date buckets from logs
  const buckets = {};  // { "2026-04-28": { IN: Set, OUT: Set, all: Set } }

  logs.slice(1).forEach(row => {
    const userId = String(row[1] || "").trim();
    const status = String(row[4] || "").trim().toUpperCase();
    const tsRaw  = row[3];
    if (!userId || !tsRaw) return;

    let dateStr = "";
    if (tsRaw instanceof Date) {
      dateStr = Utilities.formatDate(tsRaw, "Asia/Kolkata", "yyyy-MM-dd");
      // HOTFIX: Fix the dates that were mistakenly parsed by Sheets as Jan 5th, 2026 instead of May 1st, 2026
      if (tsRaw.getFullYear() === 2026 && tsRaw.getMonth() === 0 && tsRaw.getDate() === 5) {
        dateStr = "2026-05-01"; 
      }
    } else {
      const ts = String(tsRaw);
      const m = ts.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        dateStr = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      } else {
        dateStr = ts.substring(0, 10);
      }
    }

    if (!buckets[dateStr]) {
      buckets[dateStr] = { inSet: new Set(), outSet: new Set(), allSet: new Set() };
    }
    if (status === "IN")  buckets[dateStr].inSet.add(userId);
    if (status === "OUT") buckets[dateStr].outSet.add(userId);
    buckets[dateStr].allSet.add(userId);
  });

  // Sort dates and build summary array
  const summary = Object.keys(buckets).sort().map(date => ({
    Date:        date,
    TotalIN:     buckets[date].inSet.size,
    TotalOUT:    buckets[date].outSet.size,
    UniqueUsers: buckets[date].allSet.size
  }));

  // Also convert any dates in logs to strings so google.script.run serializes properly
  const safeLogs = logs.map(row => {
    let r = [...row];
    let tsRaw = r[3];
    if (tsRaw instanceof Date) {
      r[3] = Utilities.formatDate(tsRaw, "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
    } else if (typeof tsRaw === 'string') {
      const m = tsRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.*))?/);
      if (m) {
        let dd = ("0" + m[1]).slice(-2);
        let MM = ("0" + m[2]).slice(-2);
        let yyyy = m[3];
        let time = m[4] || "00:00:00";
        r[3] = yyyy + "-" + MM + "-" + dd + " " + time;
      }
    }
    return r;
  });

  // Specifically calculate metrics for "Today" based on IST Time
  const todayDateStr = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
  const todayBucket = buckets[todayDateStr] || { inSet: new Set(), outSet: new Set(), allSet: new Set() };
  
  const todayMetrics = {
    todayIn: todayBucket.inSet.size,
    todayOut: todayBucket.outSet.size,
    uniqueToday: todayBucket.allSet.size
  };

  return { success: true, summary, todayMetrics, logs: safeLogs };
}

/**
 * One-time repair: rebuilds the Summary sheet from scratch using live log data.
 * Run this manually from the Apps Script editor to fix corrupted summary rows.
 */
function repairSummarySheet() {
  const result = getAttendanceSummary();
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const sheet  = ss.getSheetByName(CONFIG.SHEET_NAME_SUMMARY);

  sheet.clearContents();
  sheet.appendRow(["Date", "TotalIN", "TotalOUT", "UniqueUsers"]);

  result.summary.forEach(row => {
    sheet.appendRow([row.Date, row.TotalIN, row.TotalOUT, row.UniqueUsers]);
  });

  Logger.log("✅ Summary sheet rebuilt from logs. " + result.summary.length + " date(s) written.");
}
