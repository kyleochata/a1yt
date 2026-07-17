// Applies playback preferences (2x speed, captions off, 1080p minimum) to
// videos opened from the YT Curator library. Declared with world: "MAIN" in
// the manifest so it can use YouTube's internal player API — an isolated
// content script can set playbackRate but not quality or captions.
//
// Only runs when the URL carries the library's marker (see VideoCard.jsx,
// which appends the same '#ytc-open' hash — keep the two in sync).
(() => {
  if (location.hash !== '#ytc-open') return;

  // Best-first, everything at or above 1080p.
  const AT_LEAST_1080 = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080'];
  const POLL_MS = 250;
  const GIVE_UP_AFTER_MS = 15000;
  let waited = 0;

  const timer = setInterval(() => {
    waited += POLL_MS;
    const player = document.getElementById('movie_player');
    const ready =
      player &&
      typeof player.setPlaybackRate === 'function' &&
      typeof player.getAvailableQualityLevels === 'function' &&
      player.getAvailableQualityLevels().length > 0;

    if (!ready) {
      if (waited >= GIVE_UP_AFTER_MS) clearInterval(timer);
      return;
    }
    clearInterval(timer);

    player.setPlaybackRate(2);

    // Captions off: unload the captions module, and fall back to clicking
    // the CC button if it's still toggled on.
    try {
      player.unloadModule('captions');
    } catch {
      /* module not loaded — captions already off */
    }
    document.querySelector('.ytp-subtitles-button[aria-pressed="true"]')?.click();

    // Quality: lock to 1080p when the video has it; otherwise the lowest
    // available tier above 1080p. Videos with no 1080p stream are left on
    // auto — the floor is unreachable anyway.
    const levels = player.getAvailableQualityLevels();
    const target = levels.includes('hd1080')
      ? 'hd1080'
      : AT_LEAST_1080.slice().reverse().find((level) => levels.includes(level));
    if (target) {
      try {
        player.setPlaybackQualityRange(target, target);
      } catch {
        /* quality API unavailable — leave on auto */
      }
    }

    // Preferences applied; drop the marker from the address bar.
    history.replaceState(null, '', location.pathname + location.search);
  }, POLL_MS);
})();
