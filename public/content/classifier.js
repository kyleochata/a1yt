// Content script (isolated world) for YouTube feed/search/related pages.
// Scrapes title + channel from video renderers, asks the service worker to
// classify each one (background.js owns the Ollama call and the cache), and
// dims videos judged "slop" above the user's sensitivity threshold.
//
// YouTube's markup is undocumented and changes; extraction is defensive with
// several selector fallbacks, and anything that can't be parsed is skipped.

(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

  const CONTAINER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'yt-lockup-view-model',
  ].join(', ');

  const MAX_INFLIGHT = 4; // background serializes LLM calls; this just bounds open channels

  const DEFAULT_PREFERENCES = {
    trustedChannels: [],
    blacklistKeywords: [],
    sensitivity: 50,
    filteringEnabled: true,
  };

  let prefs = { ...DEFAULT_PREFERENCES };
  const results = new Map(); // videoId -> {verdict, confidence, reason, source}
  const failed = new Set(); // videoIds that errored (Ollama down etc.) — retried on navigation
  const pending = new Set(); // videoIds with an in-flight request
  const queue = []; // videos waiting for a free slot

  /* ---- styles ---- */

  const style = document.createElement('style');
  style.textContent = `
    .ytc-dimmed { position: relative; }
    .ytc-dimmed > :not(.ytc-badge) { opacity: 0.12; filter: grayscale(1); transition: opacity 0.15s; }
    .ytc-dimmed.ytc-peek > :not(.ytc-badge),
    .ytc-dimmed:hover > :not(.ytc-badge),
    .ytc-dimmed.ytc-revealed > :not(.ytc-badge) { opacity: 1; filter: none; }
    .ytc-dimmed.ytc-peek:not(.ytc-revealed) > :not(.ytc-badge),
    .ytc-dimmed:hover:not(.ytc-revealed) > :not(.ytc-badge) { filter: grayscale(0.7); }
    .ytc-badge {
      position: absolute; top: 6px; left: 6px; z-index: 100;
      background: #dc2626; color: #fff; font: 500 11px/1 Roboto, Arial, sans-serif;
      padding: 4px 8px; border-radius: 999px; cursor: pointer; user-select: none;
    }
    .ytc-dimmed.ytc-revealed .ytc-badge { opacity: 0.7; }
  `;
  document.documentElement.appendChild(style);

  /* ---- metadata extraction ---- */

  function extractVideoId(href) {
    const match = /(?:[?&]v=|\/shorts\/)([\w-]{11})/.exec(href ?? '');
    return match ? match[1] : null;
  }

  function extractVideo(el) {
    if (el.querySelector('ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer')) return null;

    const link =
      el.querySelector('a#video-title-link, a#video-title') ??
      el.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    const id = extractVideoId(link?.getAttribute('href'));
    if (!id) return null;

    const title = (
      el.querySelector('#video-title')?.textContent ??
      link?.getAttribute('title') ??
      el.querySelector('h3')?.textContent ??
      ''
    ).trim();
    if (!title) return null;

    const channel = (
      el.querySelector('ytd-channel-name #text')?.textContent ??
      el.querySelector('ytd-channel-name a')?.textContent ??
      el.querySelector('[class*="byline"] a')?.textContent ??
      el.querySelector('[class*="attribution"]')?.textContent ??
      ''
    ).trim();

    return { id, title, channel };
  }

  /* ---- verdict application ---- */

  function slopThreshold() {
    // sensitivity 0 -> only confidence-1 slop (blacklist); 100 -> any slop.
    return 1 - prefs.sensitivity / 100;
  }

  function applyVerdict(el) {
    const result = results.get(el.dataset.ytcId);
    const shouldDim =
      prefs.filteringEnabled &&
      result?.verdict === 'slop' &&
      result.confidence >= slopThreshold();

    if (!shouldDim) {
      el.classList.remove('ytc-dimmed', 'ytc-revealed');
      el.querySelector(':scope > .ytc-badge')?.remove();
      return;
    }

    el.classList.add('ytc-dimmed');
    if (!el.querySelector(':scope > .ytc-badge')) {
      const badge = document.createElement('div');
      badge.className = 'ytc-badge';
      badge.textContent = `slop · ${Math.round(result.confidence * 100)}%`;
      badge.title = `${result.reason || 'Flagged by filter'} (click to toggle)`;
      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        el.classList.toggle('ytc-revealed');
      });
      el.appendChild(badge);
    }
  }

  function applyAll() {
    document.querySelectorAll('[data-ytc-id]').forEach(applyVerdict);
  }

  // CSS :hover alone isn't enough to reveal a dimmed card: hovering the
  // thumbnail spawns YouTube's inline video preview, a floating overlay
  // OUTSIDE the card, so :hover drops and the title/channel stay dimmed.
  // Track the hovered card ourselves and keep it revealed while the pointer
  // is over that preview overlay.
  let peeked = null;

  function setPeek(el) {
    if (peeked === el) return;
    peeked?.classList.remove('ytc-peek');
    peeked = el;
    peeked?.classList.add('ytc-peek');
  }

  document.addEventListener(
    'pointerover',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const card = target.closest('.ytc-dimmed');
      if (card) {
        setPeek(card);
      } else if (!(peeked && target.closest('ytd-video-preview, #video-preview'))) {
        setPeek(null);
      }
    },
    true
  );

  /* ---- classification dispatch ---- */

  function dispatch() {
    // Viewport-visible videos first — they're what the user is looking at.
    queue.sort((a, b) => visibility(b.el) - visibility(a.el));
    while (pending.size < MAX_INFLIGHT && queue.length > 0) {
      const { video } = queue.shift();
      if (results.has(video.id) || pending.has(video.id) || failed.has(video.id)) continue;
      pending.add(video.id);
      try {
        chrome.runtime.sendMessage({ type: 'ytc-classify', video }, (response) => {
          pending.delete(video.id);
          if (chrome.runtime.lastError || !response?.ok) {
            failed.add(video.id);
          } else {
            results.set(video.id, response.result);
            applyAll();
          }
          dispatch();
        });
      } catch {
        pending.delete(video.id); // extension reloaded from under us
        return;
      }
    }
  }

  function visibility(el) {
    if (!el?.isConnected) return -1;
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight ? 1 : 0;
  }

  /* ---- scanning ---- */

  function scan() {
    if (!prefs.filteringEnabled) return;
    document.querySelectorAll(CONTAINER_SELECTOR).forEach((el) => {
      const video = extractVideo(el);
      if (!video) return;
      // YouTube recycles renderer elements across SPA navigations, so an
      // element's video can change; re-tag instead of skipping seen elements.
      if (el.dataset.ytcId !== video.id) {
        el.dataset.ytcId = video.id;
        el.classList.remove('ytc-dimmed', 'ytc-revealed');
        el.querySelector(':scope > .ytc-badge')?.remove();
      }
      if (results.has(video.id)) {
        applyVerdict(el);
      } else if (!pending.has(video.id) && !failed.has(video.id)) {
        if (!queue.some((q) => q.video.id === video.id)) queue.push({ video, el });
      }
    });
    dispatch();
  }

  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 400);
  }

  /* ---- wiring ---- */

  chrome.storage.local.get('ytc.preferences', (stored) => {
    prefs = { ...DEFAULT_PREFERENCES, ...(stored?.['ytc.preferences'] ?? {}) };
    if (prefs.filteringEnabled) scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['ytc.preferences']) return;
    prefs = { ...DEFAULT_PREFERENCES, ...(changes['ytc.preferences'].newValue ?? {}) };
    applyAll(); // re-evaluate threshold/enabled without reclassifying
    if (prefs.filteringEnabled) scheduleScan();
  });

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // YouTube SPA navigation; also a good moment to retry earlier failures.
  window.addEventListener('yt-navigate-finish', () => {
    failed.clear();
    scheduleScan();
  });
})();
