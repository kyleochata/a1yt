# YT Curator

A YouTube content curator browser extension: filter out AI-generated low-quality
content and organize videos in a local library — no YouTube sign-in required.

Current modules: Library Manager + Settings UI (Phase 1), the **Content
Filtering Engine** (Module 1) — a local LLM (gemma4 via Ollama) classifies
videos as quality / neutral / slop while you browse YouTube and dims the slop
— and the **Discovery engine** (Module 3) — a quality inbox surfacing videos
already judged `quality` by the filter that aren't in your library yet, with
one-click add or dismiss. Everything runs locally; the only network call is
to Ollama on `localhost`.

## Filtering engine requirements

- [Ollama](https://ollama.com) installed and running, with the model pulled:
  `ollama pull gemma4`
- Allow the extension origin (one-time, macOS):
  `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` — then restart the
  Ollama app. For manual `ollama serve` runs, export `OLLAMA_ORIGINS` in your
  shell profile instead. Note `launchctl setenv` does not survive a reboot.
- Check the **Filter Engine** view in the app for connection status, a test
  classifier, and the verdict cache.

How it works: a content script scrapes title/channel from video renderers on
YouTube pages and asks the service worker for a verdict. The worker checks
trusted channels (always pass) and blacklist keywords (instant slop) first,
then the IndexedDB verdict cache, and only then calls Ollama (~1s per video,
one at a time, visible videos first — each video is only ever judged once).
Slop above the sensitivity threshold gets dimmed with a badge; click the badge
to reveal the video. The sensitivity slider and trusted/blacklist lists live
in Settings and apply immediately without re-classification.

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
  background.js         Service worker: opens the app tab + classification
                        service (pre-filters, verdict cache, Ollama queue)
  content/
    player-settings.js  2x/no-captions/1080p for library-opened videos
    classifier.js       Scrapes YouTube pages, dims slop via the worker
src/
  db/database.js        IndexedDB: videos, classifications cache, discovery dismissals
  db/seedData.js        8 sample videos for testing
  storage/preferences.js localStorage prefs, mirrored to chrome.storage.local
  llm/ollamaClient.js   Direct Ollama client for the Filter Engine view
  discovery/inbox.js    Pure quality-inbox builder (classifications + library + dismissals)
  hooks/                useLibrary, usePreferences, useDiscovery
  components/
    layout/Sidebar.jsx
    library/            LibraryManager, VideoCard, VideoForm, SearchBar
    filter/             FilterPanel (status, test classifier, verdict cache)
    discovery/           DiscoveryPanel, SuggestionCard (quality inbox)
    settings/           SettingsPanel, ListEditor
  utils/download.js     JSON file download helper
  utils/youtube.js      URL <-> videoId helpers (app side)
```

## Roadmap

- **Module 5** — Analytics dashboard

New modules get their own IndexedDB store (bump `DB_VERSION` in
`src/db/database.js`) and register a view in `src/App.jsx`.
