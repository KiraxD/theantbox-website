/**
 * QR-Based Digital ID & Entry Logger
 * Code.gs — Main Entry Point
 * 
 * Handles: Web App routing, QR code generation, Drive storage
 * Author: Built with Google Apps Script
 */

// ─── CONFIGURATION ───────────────────────────────────────────────────────────
const CONFIG = {
  SHEET_NAME_USERS:   "Users",
  SHEET_NAME_LOGS:    "Logs",
  SHEET_NAME_SUMMARY: "Summary",
  DRIVE_FOLDER_NAME:  "QR_Attendance_Codes",
  QR_SIZE:            300,
  RAPID_SCAN_SECONDS: 30,    // minimum seconds between duplicate scans
  QR_API_BASE:        "https://api.qrserver.com/v1/create-qr-code",
};

// ─── WEB APP ROUTING ─────────────────────────────────────────────────────────

/**
 * Handles GET requests — serves the appropriate HTML page.
 * ?page=admin  → Admin dashboard
 * default      → Scanner interface
 */
function doGet(e) {
  const page = e.parameter.page || "scanner";

  if (page === "admin") {
    return HtmlService
      .createTemplateFromFile("admin")
      .evaluate()
      .setTitle("QR Attendance — Admin Dashboard")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService
    .createTemplateFromFile("scanner")
    .evaluate()
    .setTitle("QR Attendance Scanner")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Handles POST requests — processes scan validation from the frontend.
 * Expected body: { action: "scan"|"getUsers"|"getLogs", data: {...} }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action  = payload.action;

    let result;
    switch (action) {
      case "scan":
        result = validateAndLog(payload.data);
        break;
      case "getUsers":
        result = getAllUsers();
        break;
      case "getLogs":
        result = getRecentLogs(payload.data && payload.data.limit || 50);
        break;
      case "getSummary":
        result = getAttendanceSummary();
        break;
      default:
        result = { success: false, message: "Unknown action: " + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── HTML INCLUDE HELPER ─────────────────────────────────────────────────────

/**
 * Includes another HTML file's content — used in HTML templates.
 * Usage in HTML: <?!= include('styles') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── QR CODE GENERATION ──────────────────────────────────────────────────────

/**
 * Generates a unique QR code for a user and stores it in Google Drive.
 * @param {string} userId - Unique user ID (e.g., "USR-2024-001")
 * @param {string} name   - User's full name
 * @param {string} role   - User's role (student/staff)
 * @returns {object}      - { success, driveLink, qrUrl }
 */
function generateQRForUser(userId, name, role) {
  try {
    // Build the encoded payload for the QR
    const payload = buildQRPayload(userId, name, role);
    const encodedPayload = encodeURIComponent(JSON.stringify(payload));

    // QR Server API — free, no key required (replaces deprecated Google Charts API)
    const qrUrl = `${CONFIG.QR_API_BASE}?size=${CONFIG.QR_SIZE}x${CONFIG.QR_SIZE}&data=${encodedPayload}&format=png`;

    // Fetch QR image
    const response = UrlFetchApp.fetch(qrUrl);
    const imageBlob = response.getBlob().setName(`QR_${userId}.png`);

    // Save to Drive
    const folder = getOrCreateDriveFolder();
    
    // Delete existing QR for this user if present
    const existing = folder.getFilesByName(`QR_${userId}.png`);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    const file = folder.createFile(imageBlob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log("Workspace restriction prevented setting ANYONE_WITH_LINK on file.");
    }
    const driveLink = file.getUrl();

    // Update Users sheet with drive link
    updateUserQRLink(userId, driveLink);

    Logger.log(`QR generated for ${userId} → ${driveLink}`);
    return { success: true, driveLink, qrUrl, payload };

  } catch (err) {
    Logger.log(`generateQRForUser error: ${err}`);
    return { success: false, message: err.toString() };
  }
}

/**
 * Batch generates QR codes for all users in the Users sheet.
 */
function generateAllQRCodes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  const data = usersSheet.getDataRange().getValues();

  let generated = 0;
  for (let i = 1; i < data.length; i++) { // skip header row
    const userId = data[i][0];
    const name   = data[i][1];
    const role   = data[i][3] || "student";

    if (userId && name) {
      const result = generateQRForUser(userId, name, role);
      if (result.success) generated++;
      Utilities.sleep(2000); // avoid rate limiting on QR API
    }
  }

  SpreadsheetApp.getUi().alert(`✅ Generated ${generated} QR codes. Check Google Drive → ${CONFIG.DRIVE_FOLDER_NAME}`);
}

// ─── QR PAYLOAD BUILDER ───────────────────────────────────────────────────────

/**
 * Builds the JSON payload to encode into a QR code.
 * Includes a simple checksum for basic tamper detection.
 */
function buildQRPayload(userId, name, role) {
  const issued = new Date().toISOString();
  const rawStr = `${userId}|${name}|${issued}`;
  const checksum = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, rawStr)
  ).substring(0, 8);

  return {
    uid:      userId,
    name:     name,
    role:     role || "student",
    issued:   issued,
    checksum: checksum
  };
}

// ─── DRIVE HELPERS ────────────────────────────────────────────────────────────

/**
 * Gets or creates the QR codes folder in Google Drive.
 */
function getOrCreateDriveFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const folder = DriveApp.createFolder(CONFIG.DRIVE_FOLDER_NAME);
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log("Workspace restriction prevented setting ANYONE_WITH_LINK on folder.");
  }
  return folder;
}

/**
 * Updates the QR drive link for a specific user in the Users sheet.
 */
function updateUserQRLink(userId, driveLink) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      sheet.getRange(i + 1, 5).setValue(driveLink); // Column E = QR_DriveLink
      return;
    }
  }
}

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────

/**
 * Adds a new user to the Users sheet and generates their QR code.
 * Called from the Admin panel.
 */
function addUser(name, email, role) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);

  // Generate a unique ID
  const userId = generateUserId(sheet);
  const IST_TZ = "Asia/Kolkata";
  const createdAt = Utilities.formatDate(new Date(), IST_TZ, "yyyy-MM-dd HH:mm:ss");

  sheet.appendRow([
    userId,
    name,
    email || "",
    role || "student",
    "",  // QR link placeholder
    createdAt
  ]);

  // Generate QR code for new user
  const qrResult = generateQRForUser(userId, name, role);
  return { success: true, userId, qrResult };
}

/**
 * Generates the next sequential user ID.
 */
function generateUserId(sheet) {
  const lastRow = sheet.getLastRow();
  const count   = lastRow > 1 ? lastRow - 1 : 0; // exclude header
  const padded  = String(count + 1).padStart(4, "0");
  return `USR-${new Date().getFullYear()}-${padded}`;
}

/**
 * Returns all users from the Users sheet as an array of objects.
 */
function getAllUsers() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return { success: true, users: [] };

  const headers = data[0];
  const users   = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      // Convert all values to string to prevent google.script.run serialization errors
      // Especially for Date objects which sometimes fail to serialize correctly
      obj[h] = row[i] instanceof Date ? row[i].toISOString() : String(row[i] || "");
    });
    return obj;
  });

  return { success: true, users };
}

/**
 * Returns recent log entries.
 */
function getRecentLogs(limit) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const data  = sheet.getDataRange().getValues();

  if (data.length <= 1) return { success: true, logs: [] };

  const headers = data[0];
  const rows    = data.slice(1).reverse().slice(0, limit); // most recent first
  const logs    = rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] instanceof Date ? row[i].toISOString() : String(row[i] || "");
    });
    return obj;
  });

  return { success: true, logs };
}
// trigger update
