# QR-Based Digital ID & Entry Logger

> **Submission: QR-Powered Attendance System** — Built with Google Apps Script, HTML/CSS/JS, Google Sheets, Google Drive.

---

## 📦 Submission Links

| Asset | Link |
|-------|------|
| Apps Script Project | *(paste your script.google.com link here after deployment)* |
| Deployed Web App (Scanner) | *(paste your webapp URL here)* |
| Google Sheet (Users + Logs) | *(paste your Sheets link here)* |
| Drive Folder (QR Codes) | *(paste your Drive folder link here)* |

---

## 🏗 System Architecture

```
User (Camera) ──► scanner.html (html5-qrcode)
                        │  google.script.run.validateAndLog()
                        ▼
                   Code.gs / Validation.gs
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
       Google Sheets          Google Drive
    (Users / Logs /         (QR PNG images,
     Summary tabs)           shareable links)
```

**Files:**

| File | Purpose |
|------|---------|
| `Code.gs` | `doGet()` / `doPost()` routing, QR generation via Google Charts API, Drive storage |
| `Validation.gs` | Scan validation, IN/OUT toggle, duplicate prevention (LockService), log writing |
| `Setup.gs` | One-time sheet init, sample data, custom Sheets menu |
| `scanner.html` | Camera scanner UI (html5-qrcode), real-time feedback |
| `admin.html` | Dashboard: KPI cards, Chart.js charts, user management, log viewer |
| `styles.html` | Shared dark-theme CSS (included via `<?!= include() ?>`) |

---

## 🔑 QR Generation Logic

Each QR encodes a **JSON payload**:

```json
{
  "uid":      "USR-2024-0001",
  "name":     "Arjun Sharma",
  "role":     "student",
  "issued":   "2024-01-15T10:00:00Z",
  "checksum": "aB3xK9mQ"
}
```

**Steps (`generateQRForUser`):**
1. Build JSON payload with MD5-based checksum for basic tamper detection
2. URL-encode payload → pass to Google Charts QR API (`chart.googleapis.com/chart?cht=qr`)
3. `UrlFetchApp.fetch()` downloads the PNG image
4. Save to Drive folder `QR_Attendance_Codes/` as `QR_<userId>.png`
5. Set sharing to "Anyone with link → View"
6. Write Drive link back to `Users` sheet column E

---

## 📷 Scanner Workflow

1. `scanner.html` loads `html5-qrcode` (CDN)
2. User clicks **Start Camera** → `getUserMedia()` opens device camera
3. Library decodes QR frames at 15 fps
4. On decode: debounce 2s (same raw text ignored), parse JSON payload
5. Call `google.script.run.validateAndLog({ qrPayload, scanAgent })`
6. Backend responds with `{ success, status, userInfo }` or error
7. UI shows animated result card (✅ IN / 🚪 OUT / ❌ Error)
8. Entry added to Recent Scans feed

---

## ✅ Validation Logic (`Validation.gs`)

```
validateAndLog(data):
  1. Parse QR JSON → extract uid
  2. Acquire LockService.getScriptLock() (prevents race conditions)
  3. lookupUser(uid)    → not found → USER_NOT_FOUND
  4. isDuplicateRapidScan(uid) → scanned < 30s ago → DUPLICATE_SCAN
  5. detectInOut(uid)  → scan last log → flip IN/OUT
  6. writeLogEntry(uid, name, status) → appendRow() to Logs sheet
  7. updateDailySummary(status)
  8. releaseLock() → return result
```

**IN/OUT Detection:**
- First ever scan → `IN`
- Last log was `IN` → `OUT`
- Last log was `OUT` → `IN`
- Same scan within 30 seconds → rejected as `DUPLICATE_SCAN`

---

## 🗄 Google Sheets Structure

### `Users` Sheet
| UserID | Name | Email | Role | QR_DriveLink | CreatedAt |
|--------|------|-------|------|--------------|-----------|

### `Logs` Sheet
| LogID | UserID | Name | Timestamp | Status | ScanSource |
|-------|--------|------|-----------|--------|-----------|

### `Summary` Sheet
| Date | TotalIN | TotalOUT | UniqueUsers |
|------|---------|----------|-------------|

---

## 🚀 Deployment Steps

1. Open [script.google.com](https://script.google.com) → **New Project**
2. Copy-paste all `.gs` files (Code.gs, Validation.gs, Setup.gs)
3. Create HTML files: scanner.html, admin.html, styles.html
4. Open the linked Google Sheet → run `initializeAll()` from Apps Script editor
5. **Deploy → New Deployment → Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Web App URL for distribution
7. Run `generateAllQRCodes()` to create QRs for all users

---

## ⚡ Handling 500 Concurrent Scans

> "If 500 students try scanning at the same time, how would you ensure your system handles concurrent requests without data conflicts or delays?"

**Strategy implemented:**

| Technique | How |
|-----------|-----|
| **Script-Level Lock** | `LockService.getScriptLock().waitLock(8000)` — only one write at a time |
| **Atomic Row Append** | `sheet.appendRow()` is append-only — no read-modify-write race on existing rows |
| **Optimistic Duplicate Check** | Scan last 20 rows (not full sheet) for same UID before writing |
| **Server Busy Error** | If lock times out (8s), return `SERVER_BUSY` — frontend shows retry message |
| **Frontend Debounce** | Same QR ignored for 2s client-side before even hitting server |
| **30s Rapid-Scan Window** | Server rejects same UID within 30s — reduces thundering herd |

**For production scale (500+ simultaneous):**
- Migrate backend to **Firebase Realtime Database** (WebSocket, atomic transactions)
- Use **Cloud Tasks** to queue scan events
- **Edge caching** of user lookup (Firestore cache layer)
- **Google Apps Script** has a 30 concurrent execution limit — for real 500-user deployments, a Node.js/Firebase backend is recommended

---

## 🔒 Security & Data Integrity

- **No hardcoded IDs** — all IDs generated programmatically (`USR-YYYY-NNNN`)
- **Checksum** in QR payload for basic tamper detection
- **LockService** prevents duplicate concurrent writes
- **Validation on server** — client never trusted for status determination
- **Input sanitization** — UID trimmed and type-checked before lookup

---

## 🌟 Upgrades Implemented

- ✅ **Admin Dashboard** — real-time KPI cards, Chart.js weekly/donut charts
- ✅ **Daily Summary Sheet** — auto-aggregated per-day stats
- ✅ **Role-based users** — student / faculty / staff
- ✅ **Device/browser logging** — `ScanSource` column in logs
- ✅ **Conditional formatting** — green IN / red OUT in Sheets

---

## 🛑 Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Google Apps Script 30-exec concurrency limit | LockService + queue retry on client |
| Camera permissions vary by browser | Error handler with actionable message |
| QR payload too large makes fuzzy codes | Minimized payload to uid+name+role+checksum |
| Duplicate scan on slow internet | 2s client debounce + 30s server-side window |
| html5-qrcode dashboard UI cluttered | CSS overrides to hide unwanted elements |

---

*Built with Google Apps Script · HTML · CSS · JavaScript · Google Sheets · Google Drive*
