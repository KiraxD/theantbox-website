# Google Apps Script — Complete Setup Guide

## What These Local Files Are

The files in `google-apps-script/` folder are your **source code**. Google Apps Script
has **no local editor** — you must paste these files into the online editor at
**script.google.com**.

---

## Step 1 — Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **+ Blank spreadsheet**
2. Rename it: `QR Attendance System`
3. Copy the URL — you'll need it

---

## Step 2 — Open Apps Script Editor

**From inside the Google Sheet:**

```
Extensions → Apps Script
```

This opens the editor **linked to your Sheet** at `script.google.com`.

---

## Step 3 — Paste the .gs Files

The editor shows one file called `Code.gs` by default.

### File 1 — Code.gs
- Click on `Code.gs` in the left sidebar
- **Select all → Delete** the default content
- Paste the entire content of your local file:
  `google-apps-script/Code.gs`

### File 2 — Validation.gs
- Click **+ (Add a file) → Script**
- Name it exactly: `Validation`
- Paste the entire content of: `google-apps-script/Validation.gs`

### File 3 — Setup.gs
- Click **+ → Script**
- Name it: `Setup`
- Paste content of: `google-apps-script/Setup.gs`

---

## Step 4 — Paste the HTML Files

### File 4 — scanner.html
- Click **+ → HTML**
- Name it: `scanner`
- Paste content of: `google-apps-script/scanner.html`

### File 5 — admin.html
- Click **+ → HTML**
- Name it: `admin`
- Paste content of: `google-apps-script/admin.html`

### File 6 — styles.html
- Click **+ → HTML**
- Name it: `styles`
- Paste content of: `google-apps-script/styles.html`

---

## Step 5 — Run initializeAll()

1. In the editor, click the function dropdown (top center) → select `initializeAll`
2. Click ▶ **Run**
3. First time: Google will ask for **permissions** → click **Review permissions** →
   Choose your Google account → **Advanced → Go to QR Attendance (unsafe)** → Allow
4. This will:
   - Create **Users**, **Logs**, **Summary** sheets with headers
   - Add 10 sample users
   - Create `QR_Attendance_Codes` folder in your Google Drive

---

## Step 6 — Generate QR Codes

1. Go back to your Google Sheet
2. You'll see a new menu: **🎫 QR Attendance**
3. Click: `📦 Generate All QR Codes`
4. Wait ~30 seconds (10 QRs × 0.5s delay)
5. QR images saved to **Google Drive → QR_Attendance_Codes/**

---

## Step 7 — Deploy as Web App

1. In Apps Script editor → **Deploy → New Deployment**
2. Click the ⚙️ gear icon → **Web app**
3. Set:
   - Description: `QR Attendance v1`
   - Execute as: **Me**
   - Who has access: **Anyone**  ← important for scanner to work
4. Click **Deploy**
5. **Copy the Web App URL** — this is your scanner link!

---

## Step 8 — Test the Scanner

1. Open the Web App URL on your phone or laptop
2. Click **Start Camera**
3. Point at any QR code from your Drive folder
4. You should see ✅ IN logged in your Google Sheet

---

## What Each Component Does

```
Google Apps Script (script.google.com)
├── Code.gs        → Routes web requests, generates QR images
├── Validation.gs  → Validates scans, IN/OUT logic, LockService
├── Setup.gs       → Sheet init, sample data, menu
├── scanner.html   → Camera UI served to users
├── admin.html     → Admin dashboard
└── styles.html    → Shared CSS

Google Sheets (your linked sheet)
├── Users tab      → User database (ID, Name, Email, Role, QR link)
├── Logs tab       → Every scan logged (ID, timestamp, IN/OUT)
└── Summary tab    → Daily totals (IN count, OUT count, unique users)

Google Drive (auto-created)
└── QR_Attendance_Codes/
    ├── QR_USR-2024-0001.png
    ├── QR_USR-2024-0002.png
    └── ...  (one PNG per user, shareable link)
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Permission denied" on first run | Run `initializeAll` again after granting permissions |
| QR codes show 404 | API changed — code now uses `api.qrserver.com` (already fixed) |
| Camera doesn't work | Web App must be HTTPS (deployed URL is, file:// is not) |
| "Script is locked" error | 500 concurrent users — LockService queues them, retry |
| Sheet not found error | Make sure you opened Apps Script FROM inside the Google Sheet |

---

## Quick Links

- Apps Script editor: `https://script.google.com`
- Your Google Sheet: *(open from Sheets)*
- QR Drive folder: appears in Drive after `initializeAll` runs
