# Google Drive file access setup

PaperSpace supports two explicit Drive workflows: selecting existing PDFs in Google Picker for local import, and uploading user-selected local PDFs into a PaperSpace folder in the user's own Drive. Uploaded file IDs and basic metadata are saved under the signed-in user's Firestore account so the same account can restore them on another device.

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


## 7. M1.5 — upload and restore cloud PDFs

### Upload from this browser

1. Sign in to PaperSpace using the account that owns the Firestore record.
2. In the library, choose **Upload local PDFs** and select the files.
3. Google OAuth requests the narrow `drive.file` scope. The app creates a `PaperSpace` folder in the user's Drive if one is not already recorded in this browser.
4. The selected PDF files are uploaded into that folder using Drive's resumable upload protocol, which is suitable for larger research PDFs.
5. PaperSpace saves the Drive file ID, file name and basic paper metadata under `users/{uid}/papers/{paperId}` in Firestore.
6. The original local IndexedDB copy is preserved. No local record is removed after upload.

### Restore on another device

1. Open PaperSpace on the other device and sign in to the same Firebase account.
2. Choose **Restore cloud papers**.
3. Re-authorize Google Drive using the same Google account that owns the uploaded files.
4. PaperSpace reads the user's Firestore metadata and downloads the referenced PDFs from Drive into that browser's IndexedDB.

The Firestore account and Google Drive account are separate identities. Use the same intended accounts for upload and restore. A Firebase sign-in alone does not grant Drive access.

### Storage and sync boundaries

- PDF binaries are stored in the user's Google Drive, not Firestore.
- Firestore stores the user's paper ID, title, Drive file ID/name and timestamps.
- This milestone does not synchronize notes, highlights, reading position, or annotations across devices.
- Existing local PDFs and annotations are never automatically deleted or overwritten by a failed upload.
- If the user already has a local PDF with the same paper ID, restore keeps its existing blob and annotations and refreshes the Drive reference.
- A cloud restore adds the PDF to the local library when no local copy exists.
- The Drive folder ID is only a local convenience cache; Firestore is the cross-device index of uploaded papers.

### Failure and quota behavior

- Upload requires an explicit file-picker action. No background or automatic uploads occur.
- If Drive upload or Firestore metadata saving fails, PaperSpace reports the error; local copies are retained. A Drive upload that succeeds before a later Firestore failure may leave an unindexed file in the user's Drive, which the user can manage manually.
- Google Drive storage counts against the user's own Drive quota.
- Do not link Cloud Billing, add a payment method or upgrade to a paid tier. If a quota or API policy blocks the free/no-billing workflow, stop and show the error.
- Test with non-sensitive sample PDFs first. Verify upload and restore using the same Google and Firebase accounts before relying on it for research data.
