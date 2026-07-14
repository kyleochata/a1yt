# YT Curator

A YouTube content curator browser extension: filter out AI-generated low-quality
content and organize videos in a local library — no YouTube sign-in required.

**Phase 1** (current): Local Storage & Library Manager + Settings UI. Everything
runs locally; no network calls, no LLM yet.

## Development

```bash
npm install
npm run dev      # runs the UI at localhost as a plain web app
npm run build    # builds the extension into dist/
```

## Load in Brave (or Chrome)

1. `npm run build`
2. Open `brave://extensions` (`chrome://extensions` in Chrome), enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Click the toolbar icon — the app opens in a full tab

## Structure

```
public/
  manifest.json         MV3 manifest
  background.js         Service worker (opens the app tab)
src/
  db/database.js        IndexedDB setup + CRUD + search (videos store)
  db/seedData.js        8 sample videos for testing
  storage/preferences.js localStorage preferences (+ import/export/clear)
  hooks/                useLibrary, usePreferences
  components/
    layout/Sidebar.jsx
    library/            LibraryManager, VideoCard, VideoForm, SearchBar
    settings/           SettingsPanel, ListEditor
  utils/download.js     JSON file download helper
```

## Roadmap

- **Module 1** — Content filtering engine (Ollama + Llama, local inference)
- **Module 3** — Discovery engine
- **Module 5** — Analytics dashboard

New modules get their own IndexedDB store (bump `DB_VERSION` in
`src/db/database.js`) and register a view in `src/App.jsx`.
