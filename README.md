# PaperSpace

A local-first research paper library and reading workspace.

## Features in this first deployment
- Upload and store PDF papers in browser IndexedDB
- Open and read PDFs with PDF.js
- Page navigation
- Per-paper reading notes linked to page numbers
- Search paper titles
- Starter concept desk with explanations for topology terms
- Export notes metadata as JSON
- Dark/light theme toggle
- GitHub Pages deployment

## Run locally
Open `index.html` in a local static server, for example:
`python -m http.server 8000`
Then visit http://localhost:8000.

## Deploy
GitHub Actions deploys the repository root to GitHub Pages on pushes to `main`.
In repository Settings → Pages, choose **GitHub Actions** as the build and deployment source.

## Privacy and limitations
PDFs and notes are stored in this browser's IndexedDB. They are not uploaded to GitHub. Data is device/browser-specific; export backups regularly. The concept desk currently uses a small built-in glossary, not generative AI. A genuine local browser model and persistent text highlights are future milestones. PDF.js is loaded from a public CDN, so initial reading requires an internet connection.
