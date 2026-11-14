# PaperSpace Firebase setup (M1)

This guide is for the Firebase Authentication and Cloud Firestore foundation. **Do not enable billing or link a billing account.** Use the Firebase Spark (no-cost) plan only. If a required feature asks for a billing upgrade, stop and do not proceed.

## Current implementation status

- The browser SDK is added to the project.
- `src/firebase.js` initializes Firebase only when all required public web configuration values are present.
- Authentication and Firestore instances are exported for later M1 steps.
- No Firebase project has been created or connected by this code change.
- No user data is sent to Firebase until later authentication and data integration steps are implemented.

## Project setup (manual, separate approval)

When ready to configure the cloud project:

1. Create a Firebase project using the Spark plan. Do not add a payment method or link a Cloud Billing account.
2. Register a Web app in the Firebase project.
3. Enable Authentication providers needed for M1: Google and Email/Password. Do not enable phone/SMS authentication.
4. Create a Cloud Firestore database in production mode.
5. Keep the project on Spark. Do not enable Cloud Storage, Cloud Functions, Cloud Run or Firebase Hosting for M1.
6. Configure authorised domains for the deployed GitHub Pages origin and local development origin.

Do not create or configure the project as part of repository deployment. Confirm the Spark plan and absence of billing before proceeding.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Fill the four `VITE_FIREBASE_*` values from the Firebase Web app configuration.
3. Keep `.env.local` out of version control. Do not place service-account credentials, private keys, OAuth client secrets or access tokens in Vite variables.
4. Existing Google Drive variables are separate and continue to serve the current Picker integration.

Firebase Web configuration values are public client identifiers. They are not authorization controls. Authentication and Firestore Security Rules must protect user data.

## GitHub Pages configuration

Add the four `VITE_FIREBASE_*` values as GitHub Actions repository variables (not secrets). The existing Pages workflow must pass them to the Vite build step. Do not add a billing account or paid service to make deployment work.

## Zero-spending safeguards

- Never link a Cloud Billing account or add a payment method.
- Never upgrade to Blaze.
- Do not use paid Firebase products or paid Google Cloud APIs.
- If a quota is exhausted or a service becomes unavailable on Spark, stop the affected operation and explain the limit. Never fall back to a paid plan.
- Google Drive storage remains within the user's own Google account quota.
- Recheck current Firebase and Google API terms before enabling services, because free-tier policies can change.


## Authentication interface (M1.2)

The workspace header now includes an account control. Once a Firebase project has been configured, the interface supports:

- Google sign-in through a popup.
- Email/password registration and sign-in.
- Password reset email.
- Persistent browser sign-in session and sign-out.

In Firebase Console, enable **Google** and **Email/Password** under Authentication → Sign-in method. Add the deployed GitHub Pages hostname and local development hostname under Authentication → Settings → Authorized domains. Do not enable phone authentication.

Until all Firebase web configuration values are supplied, the account dialog explicitly reports that authentication is not configured and the existing local-first reader remains usable. The interface does not create a Firebase project or upload local papers.
