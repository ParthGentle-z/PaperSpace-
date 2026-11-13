# Google Drive folder import setup

PaperSpace can optionally import PDF files from one folder that you explicitly choose in Google Drive. The integration runs in the browser; PaperSpace does not send your Drive files to a PaperSpace server.

## 1. Create a Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable **Google Picker API** and **Google Drive API**.
4. Configure the OAuth consent screen. For personal testing, set the app to **Testing** and add your Google account as a test user.
5. Create an **API key** and restrict it to the Google Picker API. Add website restrictions for:
   - `https://parthgentle-z.github.io/*`
   - `http://localhost:5173/*` (local development only)
6. Create an **OAuth Client ID** of type **Web application**. Add these authorised JavaScript origins:
   - `https://parthgentle-z.github.io`
   - `http://localhost:5173`
7. Note the Google Cloud **Project number** (not the project name or project ID).

## 2. Add GitHub repository variables

Open **PaperSpace- → Settings → Secrets and variables → Actions → Variables** and create these repository variables:

| Variable | Value |
|---|---|
| `VITE_GOOGLE_API_KEY` | The restricted Google API key |
| `VITE_GOOGLE_CLIENT_ID` | The Web OAuth client ID |
| `VITE_GOOGLE_PROJECT_NUMBER` | The numeric Google Cloud project number |

These are browser configuration identifiers, not passwords. Do not put an OAuth access token or client secret in Vite variables. Access tokens are obtained at runtime through Google Identity Services.

After saving the variables, run the **Deploy PaperSpace to GitHub Pages** workflow again (or push a new commit), because Vite embeds `VITE_*` variables at build time.

## 3. Connect from PaperSpace

1. Open PaperSpace and go to **Library**.
2. Choose **Connect Drive**.
3. Sign in with the Google account you added as a test user.
4. Choose the research folder in the Google Picker.
5. PaperSpace imports PDF files from that selected folder into this browser's IndexedDB.

The first integration uses the `drive.file` per-file scope. Google recommends this scope for files selected/shared with the app through Picker; it is narrower than access to the entire Drive. The app requests no write operations on your Drive files. The selected folder is stored as a preference, while imported PDFs are local browser copies. Re-import after adding new PDFs to the folder.

Google OAuth testing mode, consent-screen settings and API-key restrictions are controlled by your Google Cloud project. If Google displays an app-not-verified or access-denied page, check that your own Google account is listed as a test user and that the authorised JavaScript origin matches the site exactly.

## Privacy and limitations

- The PDF copies imported from Drive are stored only in the current browser's IndexedDB.
- Drive access tokens are kept in memory and are not written to localStorage.
- The initial folder import reads PDF files directly inside the selected folder; it does not recursively traverse subfolders.
- This connector is optional. Local PDF upload works without Google credentials.
