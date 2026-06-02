# Google Sheets Sync — Setup Guide

The "Sync to Google Sheets" feature requires two environment variables that must never be committed to the repository. Follow the steps below for both local development and Vercel production deployment.

---

## Required Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full contents of the Google service account JSON key file (as a single JSON string) |
| `GOOGLE_SHEET_ID` | The ID of the target Google Sheet (the long string in the sheet URL) |

---

## Step 1 — Create a Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and select your Firebase project (`chest-pt-screening`).
2. Navigate to **IAM & Admin → Service Accounts**.
3. Click **Create Service Account**, give it a name (e.g. `chest-pt-sheets-sync`), and click **Done**.
4. Click the new service account, go to the **Keys** tab, click **Add Key → Create new key → JSON**, and download the file.
5. In **IAM & Admin → IAM**, grant this service account the **Firebase Admin SDK Administrator Service Agent** role (or at minimum **Cloud Datastore User** for Firestore read access).

## Step 2 — Share the Google Sheet with the Service Account

1. Open the target Google Sheet.
2. Click **Share**, and paste the service account's email address (found in the JSON file under `client_email`).
3. Set its permission to **Editor** and click **Send**.
4. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

## Step 3 — Enable the Google Sheets API

In Google Cloud Console, go to **APIs & Services → Library**, search for **Google Sheets API**, and enable it for your project.

---

## Local Development

Add the values to `.env.local` (already in `.gitignore` — never commit it):

```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n","client_email":"...@...iam.gserviceaccount.com",...}
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

**Important:** The JSON value must be on a single line with no line breaks. The `private_key` field inside the JSON uses literal `\n` (backslash-n) to represent newlines — do not expand them.

---

## Vercel Production Deployment

1. Go to your Vercel project → **Settings → Environment Variables**.
2. Add `GOOGLE_SERVICE_ACCOUNT_JSON`:
   - Paste the **entire JSON file content** as the value (Vercel handles multiline values correctly).
   - Apply to **Production**, **Preview**, and **Development** environments.
3. Add `GOOGLE_SHEET_ID`:
   - Paste the Sheet ID string.
   - Apply to the same environments.
4. Redeploy the project for the variables to take effect.

---

## How the Sync Works

- **Patient detail page** → "Sync to Google Sheets" button: syncs only that patient's outcome rows.
- **Admin Dashboard** → "Sync All → Sheets" button (admin only): syncs all patients' outcome rows.
- Both operations **upsert** by `record_id` (column A). Existing rows are updated in-place; new rows are appended. No rows are ever deleted.
- The data lands in a tab named **Outcomes** in the target sheet (created automatically if missing).

### Column layout

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| record_id | HN | patient_name | type | session_or_phase | outcome_name | value | unit | recorded_date |
