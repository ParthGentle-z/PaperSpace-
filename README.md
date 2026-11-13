# PaperSpace

A local-first research paper reading and thinking workspace built with **React + Vite**.

## Current features
- Responsive research library with PDF upload
- PDF reader with page navigation, fit-to-width, and zoom controls
- Reading notes linked to paper and page
- Notes overview and JSON export
- Concept desk with a guided usage manual, glossary search, intuitive explanations, and research examples
- Consistent dark/light themes across the full interface
- Browser IndexedDB storage; PDFs are not uploaded to GitHub

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## GitHub Pages
GitHub Actions installs dependencies, builds the Vite app, and deploys the `dist` directory. Vite is configured for this repository path: `/PaperSpace-/`.

## Privacy and limitations
PDFs and notes are stored in this browser's IndexedDB. They do not sync between devices and are not uploaded to GitHub. Export notes regularly; the current JSON export does not include PDF files. The concept desk currently contains curated starter explanations, not generative AI. A local in-browser model, persistent PDF text highlights, and cross-paper semantic search are future milestones.
