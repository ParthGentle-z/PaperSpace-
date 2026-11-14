# Google Drive file access setup

PaperSpace can let you explicitly select PDF files from your Google Drive using Google Picker. The browser downloads selected PDFs into this browser's IndexedDB. This milestone does not upload local files to Drive or synchronize files across devices.

## 1. Google Cloud configuration (manual; separate approval)

Do not create or change Google Cloud resources as part of a repository code change. When separately approved:

1. Open Google Cloud Console and use a project you control.
2. Enable **Google Picker API** and **Google Drive API** only if available without enabling billing.
3. Configure the OAuth consent screen. For personal testing, use Testing mode and add your Google account as a test user.
4. Create an API key restricted to the Google Picker API and the required website origins.
5. Create an OAuth Client ID of type Web application. Add the exact GitHub Pages origin and local development origin as authorised JavaScript origins.
6. Note the numeric Google Cloud project number.

If the console requires a billing account or paid upgrade for any required API, stop. Do not link billing or add a payment method. Google API policies and quotas can change; this design must stop if a required operation is no longer available without billing.

## 2. GitHub Actions variables

Add these repository variables under Settings → Secrets and variables → Actions → Variables:

| Variable | Purpose |
|---|---|
| `VITE_GOOGLE_API_KEY` | Restricted Picker API key |
| `VITE_GOOGLE_CLIENT_ID` | Web OAuth client ID |
| `VITE_GOOGLE_PROJECT_NUMBER` | Numeric Cloud project number |

These are browser configuration identifiers, not secrets. Never add OAuth client secrets, service-account keys or access tokens to Vite variables or the repository.

## 3. How PaperSpace requests access

1. Open PaperSpace → Library → Connect Drive.
2. Google Identity Services asks for the narrow `https://www.googleapis.com/auth/drive.file` scope.
3. In Picker, select one or more PDF files explicitly. Folder-wide browsing/import is not used.
4. PaperSpace downloads only the selected PDFs into the current browser's IndexedDB.

Selecting an individual file through Picker is the intended per-file authorization flow. The app does not request broad `drive` or `drive.readonly` access.

## 4. Token lifecycle and disconnect

- Access tokens are held in memory only; they are not written to localStorage, IndexedDB, Firestore or logs.
- The app checks the token's expiry before downloading a selected PDF.
- If the token expires or Google returns an authorization error, the operation stops and the user must reconnect.
- Disconnect clears the in-memory token and attempts to revoke the current grant through Google Identity Services.
- Disconnecting Drive does not delete PDFs already imported into local IndexedDB. Those local copies remain until the user removes them through the existing local library controls.

The selected file names/IDs are stored only as a local UI preference. They are not credentials and are not proof of an active authorization.

## 5. Privacy and limitations

- Only files explicitly selected in Picker are downloaded.
- The original Drive files are read, not edited or deleted.
- PDFs remain local to this browser in this milestone.
- No background Drive scanning, recursive folder traversal, automatic upload or cross-device retrieval is implemented here.
- Google OAuth testing-mode restrictions and token lifetimes are controlled by Google and may change.
- Do not use real or sensitive research documents until you have reviewed the Google consent screen and confirmed the account and app configuration.

## 6. Zero-spending rule

PaperSpace must not add a payment method, link Cloud Billing or upgrade to a paid Google Cloud plan for this integration. If a quota or API policy blocks the free/no-billing path, stop and show an error rather than retrying through a paid service.
