# YT Curator (a1yt)

Chrome MV3 extension + React app: filters low-quality "slop" videos on YouTube and
manages a local video library. No sign-in; everything stays on-device.

## Commands

```bash
npm test         # node --test (zero test deps) — slop scorer fixtures + unit tests
npm run build    # vite → dist/  (public/ is copied verbatim; src/ is bundled)
npm run dev      # app page only — chrome.* APIs are absent, code must degrade gracefully
```

Manual check: load `dist/` as an unpacked extension, browse YouTube with
Settings → Slop score filter → debug mode on (logs matched signals to the tab console).

**Definition of done:** `npm test` and `npm run build` both pass. There is no lint/format command.

## Architecture

- `public/` — copied into `dist/` unbundled:
  - `manifest.json` — content-script **load order matters** (see public/content/CLAUDE.md)
  - `background.js` — service worker: LLM classification (Ollama `gemma4` @ localhost:11434,
    serialized queue) + IndexedDB verdict cache
  - `content/` — classic scripts on youtube.com (see nested CLAUDE.md before editing)
- `src/` — React app (library manager, settings/options page), IndexedDB via `src/db/database.js`

Filtering runs cheap-first: heuristic slop score in the content scripts
(hide ≥ 10 / dim ≥ 6 by default), then the LLM only for videos below the dim band.
Trusted channels + `ytc.allowlist` are never hidden by either layer.

## Sync invariants — change one side, change the other

- `DEFAULT_PREFERENCES` / `DEFAULT_SLOP_PREFS`: `src/storage/preferences.js` ↔
  `public/content/classifier.js` ↔ `public/background.js` (background has no slop key; that's fine)
- Slop default weights/thresholds: `src/storage/preferences.js` ↔ `public/content/slop-filters.js`
- LLM prompt: `public/background.js` `buildPrompt()` ↔ `src/llm/ollamaClient.js`
- Channel matching (`normalizeChannel`/`channelMatches`): `public/content/channel-match.js`
  ↔ `public/background.js`
- IndexedDB names/version/upgrade: `src/db/database.js` ↔ `public/background.js`
  (either context may run the upgrade)

## Storage keys (chrome.storage.local)

- `ytc.preferences` — mirrored **one-way** from the app page's localStorage by
  `src/storage/preferences.js`. Extension-side code must never write it (the next app
  save would clobber the write); extension-owned state gets its own key instead.
- `ytc.allowlist` — user allowlist, owned by the content script
- `ytc.channelStats`, `ytc.skeletons` — tier-4 caches (7-day TTL, size-capped)

## Conventions

- Tune filter phrases/regexes/weights **only** in `public/content/slop-filters.js`
  (config), never in `slop-score.js` (matcher). After tuning, run `npm test` —
  `tests/fixtures/titles.json` guards against false positives on legit clickbait;
  extend the fixtures when adding signals.
- YouTube's DOM is undocumented and shifts: extraction code keeps multiple selector
  fallbacks and skips anything unparsable rather than throwing.
- Preference objects are merged over defaults on load so new keys get defaults on
  old stored data — preserve that pattern when adding preferences, and sanitize new
  fields in `importPreferencesJSON`.
