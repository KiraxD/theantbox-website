/**
 * QR-Based Digital ID & Entry Logger
 * Setup.gs — One-Time Initialization & Sample Data
 *
 * Run these functions ONCE from Apps Script editor to set up the project.
 * Menu: Extensions → Apps Script → Run → initializeAll
 */

// ─── MASTER SETUP ─────────────────────────────────────────────────────────────

/**
 * Master setup function — run this ONCE to initialize everything.
 * 1. Creates all required sheets with headers
 * 2. Populates sample users
 * 3. Creates Drive folder
 * 4. Generates QR codes for sample users
 * 5. Adds custom menu to Spreadsheet
 */
function initializeAll() {
  initializeSheets();
  populateSampleUsers();
  createDriveFolder();
  addCustomMenu();
  SpreadsheetApp.getUi().alert(
    "✅ QR Attendance System initialized!\n\n" +
    "Next steps:\n" +
    "1. Add your real users via the Admin panel\n" +
    "2. Run 'Generate All QR Codes' from the menu\n" +
    "3. Deploy this script as a Web App\n" +
    "4. Share the Web App URL with users"
  );
}

// ─── SHEET INITIALIZATION ─────────────────────────────────────────────────────

/**
 * Creates and formats all required sheets.
 * Safe to run multiple times — skips sheets that already exist.
 */
function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupUsersSheet(ss);
  setupLogsSheet(ss);
  setupSummarySheet(ss);

  Logger.log("Sheets initialized.");
}

function setupUsersSheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_USERS);
  }

  if (sheet.getLastRow() === 0) {
    // Write headers
    const headers = ["UserID", "Name", "Email", "Role", "QR_DriveLink", "CreatedAt"];
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground("#1a1a2e");
    headerRange.setFontColor("#e94560");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 150);
    sheet.setColumnWidth(5, 300); // QR link column wider
  }
}

function setupLogsSheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_LOGS);
  }

  if (sheet.getLastRow() === 0) {
    const headers = ["LogID", "UserID", "Name", "Timestamp", "Status", "ScanSource"];
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground("#0f3460");
    headerRange.setFontColor("#e94560");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 150);
    sheet.setColumnWidth(4, 220); // Timestamp wider

    // Conditional formatting for Status column
    const statusRange = sheet.getRange("E2:E10000");
    const inRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("IN")
      .setBackground("#1e8449")
      .setFontColor("#ffffff")
      .setRanges([statusRange])
      .build();
    const outRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("OUT")
      .setBackground("#e74c3c")
      .setFontColor("#ffffff")
      .setRanges([statusRange])
      .build();
    sheet.setConditionalFormatRules([inRule, outRule]);
  }
}

function setupSummarySheet(ss) {
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SUMMARY);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_SUMMARY);
  }

  if (sheet.getLastRow() === 0) {
    const headers = ["Date", "TotalIN", "TotalOUT", "UniqueUsers"];
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground("#16213e");
    headerRange.setFontColor("#0f3460");
    headerRange.setFontWeight("bold");
    headerRange.setFontSize(11);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 150);
  }
}

// ─── SAMPLE DATA ──────────────────────────────────────────────────────────────

/**
 * Populates the Users sheet with 10 demo students for testing.
 * Only runs if Users sheet is empty (after header row).
 */
function populateSampleUsers() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);

  if (sheet.getLastRow() > 1) {
    Logger.log("Users sheet already has data — skipping sample population.");
    return;
  }

  const sampleUsers = [
    ["USR-2024-0001", "Arjun Sharma",    "arjun.sharma@college.edu",   "student", "", new Date().toISOString()],
    ["USR-2024-0002", "Priya Mehta",     "priya.mehta@college.edu",    "student", "", new Date().toISOString()],
    ["USR-2024-0003", "Rahul Verma",     "rahul.verma@college.edu",    "student", "", new Date().toISOString()],
    ["USR-2024-0004", "Sneha Patel",     "sneha.patel@college.edu",    "student", "", new Date().toISOString()],
    ["USR-2024-0005", "Vikram Singh",    "vikram.singh@college.edu",   "student", "", new Date().toISOString()],
    ["USR-2024-0006", "Anita Desai",     "anita.desai@college.edu",    "student", "", new Date().toISOString()],
    ["USR-2024-0007", "Karan Joshi",     "karan.joshi@college.edu",    "student", "", new Date().toISOString()],
    ["USR-2024-0008", "Meera Nair",      "meera.nair@college.edu",     "student", "", new Date().toISOString()],
    ["USR-2024-0009", "Dr. Suresh Kumar","suresh.kumar@college.edu",   "faculty", "", new Date().toISOString()],
    ["USR-2024-0010", "Prof. Lata Roy",  "lata.roy@college.edu",       "faculty", "", new Date().toISOString()],
  ];

  sheet.getRange(2, 1, sampleUsers.length, sampleUsers[0].length).setValues(sampleUsers);
  Logger.log(`Added ${sampleUsers.length} sample users.`);
}

// ─── DRIVE SETUP ──────────────────────────────────────────────────────────────

/**
 * Creates the QR codes folder in Google Drive (if not already present).
 */
function createDriveFolder() {
  const folder = getOrCreateDriveFolder();
  Logger.log(`Drive folder ready: ${folder.getName()} (${folder.getId()})`);
  return folder.getUrl();
}

// ─── CUSTOM MENU ──────────────────────────────────────────────────────────────

/**
 * Adds a custom menu to the Google Sheet for easy access to admin functions.
 * Runs automatically when the Sheet is opened.
 */
function onOpen() {
  addCustomMenu();
}

function addCustomMenu() {
  SpreadsheetApp.getUi()
    .createMenu("🎫 QR Attendance")
    .addItem("🚀 Initialize System",       "initializeAll")
    .addSeparator()
    .addItem("📦 Generate All QR Codes",   "generateAllQRCodes")
    .addItem("➕ Add Single User QR",      "promptAddUser")
    .addSeparator()
    .addItem("📊 Refresh Summary",         "refreshSummary")
    .addItem("🗑️ Clear Today's Logs",      "clearTodaysLogs")
    .addSeparator()
    .addItem("ℹ️ System Info",             "showSystemInfo")
    .addToUi();
}

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Prompts the admin to add a new user via a dialog.
 */
function promptAddUser() {
  const ui = SpreadsheetApp.getUi();
  const nameResp = ui.prompt("Add New User", "Enter full name:", ui.ButtonSet.OK_CANCEL);
  if (nameResp.getSelectedButton() !== ui.Button.OK) return;

  const emailResp = ui.prompt("Add New User", "Enter email:", ui.ButtonSet.OK_CANCEL);
  if (emailResp.getSelectedButton() !== ui.Button.OK) return;

  const roleResp = ui.prompt("Add New User", "Enter role (student/faculty/staff):", ui.ButtonSet.OK_CANCEL);

  const result = addUser(
    nameResp.getResponseText().trim(),
    emailResp.getResponseText().trim(),
    (roleResp.getSelectedButton() === ui.Button.OK ? roleResp.getResponseText().trim() : "student")
  );

  if (result.success) {
    ui.alert(`✅ User added!\nID: ${result.userId}\nQR saved to Drive.`);
  } else {
    ui.alert("❌ Error adding user: " + JSON.stringify(result));
  }
}

/**
 * Refreshes the full Summary sheet by recalculating from Logs.
 */
function refreshSummary() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const logsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const summSheet = ss.getSheetByName(CONFIG.SHEET_NAME_SUMMARY);
  const logs      = logsSheet.getDataRange().getValues();

  if (logs.length <= 1) return;

  // Group by date
  const byDate = {};
  logs.slice(1).forEach(row => {
    const ts     = String(row[3]);
    const date   = ts.substring(0, 10);
    const status = String(row[4]).toUpperCase();
    const uid    = String(row[1]);

    if (!byDate[date]) byDate[date] = { IN: 0, OUT: 0, users: new Set() };
    if (status === "IN")  byDate[date].IN++;
    if (status === "OUT") byDate[date].OUT++;
    byDate[date].users.add(uid);
  });

  // Rebuild summary sheet
  summSheet.clearContents();
  summSheet.appendRow(["Date", "TotalIN", "TotalOUT", "UniqueUsers"]);
  Object.keys(byDate).sort().forEach(date => {
    const d = byDate[date];
    summSheet.appendRow([date, d.IN, d.OUT, d.users.size]);
  });

  SpreadsheetApp.getUi().alert("✅ Summary refreshed.");
}

/**
 * Clears log entries from today (useful during testing).
 */
function clearTodaysLogs() {
  const ui = SpreadsheetApp.getUi();
  const confirm = ui.alert("Clear Today's Logs", "Are you sure? This cannot be undone.", ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const data  = sheet.getDataRange().getValues();
  const today = new Date().toISOString().substring(0, 10);

  // Find rows to delete (bottom-up to avoid index shift)
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][3]).startsWith(today)) {
      sheet.deleteRow(i + 1);
    }
  }

  ui.alert("✅ Today's logs cleared.");
}

/**
 * Shows system configuration info in a dialog.
 */
function showSystemInfo() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet  = ss.getSheetByName(CONFIG.SHEET_NAME_USERS);
  const logsSheet   = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS);
  const userCount   = Math.max(0, usersSheet.getLastRow() - 1);
  const logCount    = Math.max(0, logsSheet.getLastRow() - 1);
  const scriptUrl   = ScriptApp.getService().getUrl();

  SpreadsheetApp.getUi().alert(
    `📊 QR Attendance System Info\n\n` +
    `Registered Users: ${userCount}\n` +
    `Total Log Entries: ${logCount}\n` +
    `Rapid-Scan Window: ${CONFIG.RAPID_SCAN_SECONDS}s\n` +
    `Drive Folder: ${CONFIG.DRIVE_FOLDER_NAME}\n` +
    `Web App URL: ${scriptUrl || "(not deployed yet)"}`
  );
}
