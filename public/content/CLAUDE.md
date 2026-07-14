# Content scripts — constraints

- **Classic scripts, not modules.** No `import`/`export`. Each file wraps in an IIFE
  and attaches its API to `self` (`YTC_SLOP_CONFIG`, `YTC_SLOP_SCORE`, `YTC_SLOP_CHANNEL`).
  Keep the `typeof self !== 'undefined' ? self : globalThis` receiver — tests load these
  files in a bare `node:vm` context where `self` doesn't exist.
- **Load order is the dependency graph**, set in manifest.json:
  `slop-filters.js → slop-score.js → slop-channel.js → classifier.js`.
  New shared code must be inserted in order there.
- `slop-filters.js` is data-only config; `slop-score.js` is pure matcher logic.
  Don't mix the two — tuning must never require touching matcher code.
- `player-settings.js` runs in the MAIN world; everything else runs isolated.
  Isolated-world scripts must guard on `chrome.runtime?.id` (extension can reload
  from under a live page).
- Same-origin `fetch` from here reaches youtube.com without extra host permissions —
  prefer that over background fetches for YouTube pages.
- Title matching operates on the NFKC-normalized title (`normalizeTitle`) to defeat
  fancy-unicode fonts; ALL-CAPS and emoji checks use the case-preserved `nfkc` form,
  phrase/regex matching uses the lowercased emoji-stripped `plain` form.
