# PaperSpace

A local-first research paper reading and thinking workspace built with **React + Vite**.

## Workspace features

- Responsive research library with local PDF upload and paper management
- Dedicated `/Reading` workspace with multiple open-paper tabs
- Open Papers list below the main navigation
- Collapsible/hidden left navigation
- Continuous PDF scrolling, page counter, page navigation, fit-to-width and zoom
- Selectable PDF text and persistent page-positioned highlights
- Undo the most recent highlight or remove any individual annotation
- Paper-specific notes, highlights and a separate AI Suggestions panel
- Global Concept Desk with a guided manual and research glossary
- Dark/light themes
- Optional Google Drive folder import (requires personal Google Cloud configuration)
- Browser IndexedDB storage; PDFs are not uploaded to GitHub

## Run locally

```bash
npm install
npm run dev
``

## Build

```bash
npm run build
npm run preview
``

## GitHub Pages

GitHub Actions installs dependencies, builds the Vite application, and deploys `dist`.

Vite uses the repository base path `/PaperSpace-/`. The `public/404.html` SPA fallback redirects direct requests such as `/PaperSpace-/Reading` back through the main entry point so React can restore the reader route.

## Optional Google Drive connector

See [Google Drive folder import setup](docs/GOOGLE_DRIVE_SETUP.md). The connector is disabled until the Google API key, Web OAuth client ID and Google Cloud project number are configured as GitHub repository Actions variables.

## Privacy and limitations

- PDFs, notes and highlights are stored in the current browser's IndexedDB. They do not automatically sync between devices.
- JSON backup currently exports paper metadata, notes and highlights; it does not include PDF binary files.
- Imported Drive PDFs become local browser copies. The initial connector imports PDFs in the selected folder (not nested subfolders).
- The Concept Desk uses curated starter explanations. The per-paper AI Suggestions panel is a dedicated future integration point; a local generative model is not yet connected.
- Scanned image-only PDFs need OCR before their text can be selected and highlighted.
