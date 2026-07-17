// Content script (isolated world) for YouTube feed/search/related pages.
//
// Two filtering layers, cheap first:
//   1. Heuristic slop score (slop-filters.js config + slop-score.js matcher,
//      tier-4 channel stats via slop-channel.js). Score >= hideThreshold
//      collapses the video to a placeholder; >= dimThreshold dims it.
//   2. Videos below the dim band fall through to the existing LLM pipeline:
//      background.js owns the Ollama call and the cache, and verdicts dim
//      based on the sensitivity preference.
//
// Trusted channels and the ytc.allowlist are never hidden or dimmed by
// either layer.
//
// YouTube's markup is undocumented and changes; extraction is defensive with
// several selector fallbacks, and anything that can't be parsed is skipped.

(() => {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;

  const SLOP_CONFIG = self.YTC_SLOP_CONFIG;
  const SLOP = self.YTC_SLOP_SCORE;
  const CHANNEL = self.YTC_SLOP_CHANNEL;
  const MATCH = self.YTC_CHANNEL_MATCH;

  const CONTAINER_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'yt-lockup-view-model',
  ].join(', ');

  const MAX_INFLIGHT = 4; // background serializes LLM calls; this just bounds open channels
  const ALLOWLIST_KEY = 'ytc.allowlist';

  const DEFAULT_SLOP_PREFS = {
    hideThreshold: SLOP_CONFIG.thresholds.hide,
    dimThreshold: SLOP_CONFIG.thresholds.dim,
    weights: {
      tier1: SLOP_CONFIG.tier1.weight,
      tier2: SLOP_CONFIG.tier2.weight,
      structural: SLOP_CONFIG.structural.weight,
      topicMultiplier: 1,
      channelMultiplier: 1,
    },
    debug: false,
  };

  const DEFAULT_PREFERENCES = {
    trustedChannels: [],
    blacklistKeywords: [],
    sensitivity: 50,
    filteringEnabled: true,
    slop: DEFAULT_SLOP_PREFS,
  };

  let prefs = { ...DEFAULT_PREFERENCES };
  let allowlist = []; // lowercased channel names and/or channel paths, user-managed via placeholder button
  let storageLoaded = false; // don't filter until prefs + allowlist have loaded
  const results = new Map(); // videoId -> {verdict, confidence, reason, source} (LLM layer)
  const failed = new Set(); // videoIds that errored (Ollama down etc.) — retried on navigation
  const pending = new Set(); // videoIds with an in-flight request
  const queue = []; // videos waiting for a free slot
  const titles = new Map(); // videoId -> raw title (weight-independent scoring input)
  const titleScores = new Map(); // videoId -> {score, signals}
  const channelStats = new Map(); // channelPath -> stats|null (weight-independent scoring input)
  const channelScores = new Map(); // channelPath -> {score, signals} | 'pending'
  const revealed = new Set(); // videoIds un-hidden via "show anyway"

  function mergePrefs(stored) {
    const merged = { ...DEFAULT_PREFERENCES, ...(stored ?? {}) };
    merged.slop = {
      ...DEFAULT_SLOP_PREFS,
      ...(stored?.slop ?? {}),
      weights: { ...DEFAULT_SLOP_PREFS.weights, ...(stored?.slop?.weights ?? {}) },
    };
    return merged;
  }

  function sameList(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

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
    .ytc-hidden > :not(.ytc-placeholder) { display: none !important; }
    .ytc-placeholder {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      margin: 4px 0; padding: 8px 12px; border: 1px dashed rgba(128, 128, 128, 0.5);
      border-radius: 8px; font: 12px/1.4 Roboto, Arial, sans-serif;
      color: var(--yt-spec-text-secondary, #909090);
    }
    .ytc-placeholder button {
      background: none; border: none; padding: 0; cursor: pointer;
      font: inherit; color: var(--yt-spec-call-to-action, #3ea6ff);
    }
  `;
  document.documentElement.appendChild(style);

  /* ---- metadata extraction ---- */

  function extractVideoId(href) {
    const match = /(?:[?&]v=|\/shorts\/)([\w-]{11})/.exec(href ?? '');
    return match ? match[1] : null;
  }

  const DURATION_TEXT_RE = /^\d{1,2}(?::\d{2}){1,2}$/;

  // Duration badge markup varies across YouTube's renderer generations (the
  // classic ytd-* Polymer components vs. the newer yt-lockup-view-model
  // redesign). The last resort isn't tied to a specific class name — it
  // scans small badge-like elements near the thumbnail for "mm:ss"-shaped
  // text, so future markup churn degrades gracefully instead of silently
  // going blank again.
  function findDurationText(el) {
    const known =
      el.querySelector('ytd-thumbnail-overlay-time-status-renderer #text')?.textContent ??
      el.querySelector('ytd-thumbnail-overlay-time-status-renderer')?.textContent ??
      el.querySelector('badge-shape .badge-shape-wiz__text')?.textContent ??
      null;
    if (known?.trim()) return known.trim();

    const thumb = el.querySelector('#thumbnail, ytd-thumbnail, yt-thumbnail-view-model') ?? el;
    for (const node of thumb.querySelectorAll('span, div')) {
      const text = node.textContent.trim();
      if (DURATION_TEXT_RE.test(text)) return text;
    }
    return '';
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

    const channelLink =
      el.querySelector('ytd-channel-name a[href]') ??
      el.querySelector('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]');
    const channelPath = (channelLink?.getAttribute('href') ?? '').split('?')[0] || null;

    const channel = (
      el.querySelector('ytd-channel-name #text')?.textContent ??
      el.querySelector('ytd-channel-name a')?.textContent ??
      el.querySelector('[class*="byline"] a')?.textContent ??
      el.querySelector('[class*="attribution"]')?.textContent ??
      ''
    ).trim();

    // Live streams, premieres, and some Shorts renderers omit this badge —
    // durationSeconds is just null then, not an error.
    const durationText = findDurationText(el);
    const durationSeconds = durationText ? CHANNEL.parseDurationSeconds(durationText) : null;

    return { id, title, channel, channelPath, durationSeconds };
  }

  /* ---- heuristic scoring ---- */

  function debugLog(label, video, result) {
    if (!prefs.slop.debug || result.signals.length === 0) return;
    console.debug(
      `[ytc] ${label} score ${result.score} — "${video.title}" (${video.channel || 'unknown channel'})`,
      result.signals
    );
  }

  function scoreVideo(video) {
    if (!titleScores.has(video.id)) {
      const result = SLOP.scoreTitle(video.title, SLOP_CONFIG, prefs.slop.weights);
      titles.set(video.id, video.title);
      titleScores.set(video.id, result);
      debugLog('title', video, result);
    }
    if (video.channelPath && !channelScores.has(video.channelPath)) {
      channelScores.set(video.channelPath, 'pending');
      CHANNEL.getChannelStats(video.channelPath, SLOP_CONFIG).then((stats) => {
        const result = SLOP.scoreChannelStats(stats, SLOP_CONFIG, prefs.slop.weights);
        channelStats.set(video.channelPath, stats);
        channelScores.set(video.channelPath, result);
        debugLog('channel', video, result);
        applyAll();
      });
    }
  }

  // Weights changed: rebuild both score maps from the raw inputs we already
  // hold. Rescoring in place (rather than clearing and waiting for the
  // debounced scan) keeps every card's score continuous — a momentary 0 would
  // un-hide the whole feed until the rescan landed.
  function rescoreAll() {
    for (const [id, title] of titles) {
      titleScores.set(id, SLOP.scoreTitle(title, SLOP_CONFIG, prefs.slop.weights));
    }
    for (const [path, stats] of channelStats) {
      channelScores.set(path, SLOP.scoreChannelStats(stats, SLOP_CONFIG, prefs.slop.weights));
    }
    // Channels still in flight stay 'pending'; their handler scores with the
    // new weights when it resolves.
  }

  function slopScore(el) {
    const title = titleScores.get(el.dataset.ytcId);
    const channel = channelScores.get(el.dataset.ytcChannelPath);
    return (title?.score ?? 0) + (typeof channel === 'object' && channel ? channel.score : 0);
  }

  function isAllowed(channelName, channelPath) {
    return (
      allowlist.some((c) => MATCH.channelMatches(c, channelName, channelPath)) ||
      prefs.trustedChannels.some((c) => MATCH.channelMatches(c, channelName, channelPath))
    );
  }

  /* ---- verdict application ---- */

  function slopThreshold() {
    // sensitivity 0 -> only confidence-1 slop (blacklist); 100 -> any slop.
    return 1 - prefs.sensitivity / 100;
  }

  function clearMarks(el) {
    el.classList.remove('ytc-dimmed', 'ytc-revealed', 'ytc-hidden');
    el.querySelector(':scope > .ytc-badge')?.remove();
    el.querySelector(':scope > .ytc-placeholder')?.remove();
  }

  function renderHidden(el, score) {
    el.classList.add('ytc-hidden');
    el.classList.remove('ytc-dimmed', 'ytc-revealed');
    el.querySelector(':scope > .ytc-badge')?.remove();
    if (el.querySelector(':scope > .ytc-placeholder')) return;

    const box = document.createElement('div');
    box.className = 'ytc-placeholder';

    const label = document.createElement('span');
    label.textContent = `Hidden · slop score ${score}`;
    box.appendChild(label);

    const show = document.createElement('button');
    show.textContent = 'Show anyway';
    show.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      revealed.add(el.dataset.ytcId);
      applyVerdict(el); // score >= hide implies >= dim, so this lands in the dimmed state…
      el.classList.add('ytc-revealed'); // …which "show anyway" starts out revealed
    });
    box.appendChild(show);

    const channelName = (el.dataset.ytcChannel ?? '').trim();
    if (channelName) {
      const allow = document.createElement('button');
      allow.textContent = 'Allowlist channel';
      allow.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Store the channel path too: some layouts expose only the /@handle
        // link, and a name-only entry can't match those cards.
        const path = (el.dataset.ytcChannelPath ?? '').toLowerCase();
        const next = [
          ...new Set([...allowlist, channelName.toLowerCase(), ...(path ? [path] : [])]),
        ];
        try {
          chrome.storage.local.set({ [ALLOWLIST_KEY]: next }); // onChanged re-applies
        } catch {
          // Extension reloaded from under us; this page's script is orphaned.
          allow.textContent = 'Reload page to allowlist';
          allow.disabled = true;
        }
      });
      box.appendChild(allow);
    }

    el.appendChild(box);
  }

  function renderDimmed(el, badgeText, badgeTitle) {
    el.classList.add('ytc-dimmed');
    el.classList.remove('ytc-hidden');
    el.querySelector(':scope > .ytc-placeholder')?.remove();
    const existing = el.querySelector(':scope > .ytc-badge');
    if (existing) {
      // Only write when the text actually changed: an unconditional write
      // replaces the text node, which our own MutationObserver sees, which
      // schedules another scan — a self-sustaining loop while any card is dimmed.
      if (existing.textContent !== badgeText) existing.textContent = badgeText;
      if (existing.title !== badgeTitle) existing.title = badgeTitle;
      return;
    }
    const badge = document.createElement('div');
    badge.className = 'ytc-badge';
    badge.textContent = badgeText;
    badge.title = badgeTitle;
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      el.classList.toggle('ytc-revealed');
    });
    el.appendChild(badge);
  }

  function applyVerdict(el) {
    const id = el.dataset.ytcId;
    if (!prefs.filteringEnabled || isAllowed(el.dataset.ytcChannel, el.dataset.ytcChannelPath)) {
      clearMarks(el);
      return;
    }

    // Layer 1: heuristic slop score.
    // Never fully hide a card whose channel we couldn't extract: a hidden card
    // (display:none) stops YouTube from lazily rendering its byline, so an
    // allowlisted channel could stay hidden forever. Dimming keeps it in
    // layout; once the byline renders, the isAllowed gate above clears it.
    const channelKnown = Boolean(el.dataset.ytcChannel || el.dataset.ytcChannelPath);
    const score = slopScore(el);
    if (score >= prefs.slop.hideThreshold && !revealed.has(id) && channelKnown) {
      renderHidden(el, score);
      return;
    }
    if (score >= prefs.slop.dimThreshold) {
      const signals = [
        ...(titleScores.get(id)?.signals ?? []),
        ...((typeof channelScores.get(el.dataset.ytcChannelPath) === 'object' &&
          channelScores.get(el.dataset.ytcChannelPath)?.signals) ||
          []),
      ];
      renderDimmed(
        el,
        `slop score ${score}`,
        `${signals.map((s) => s.name).join(', ') || 'Heuristic filter'} (click to toggle)`
      );
      return;
    }

    // Layer 2: LLM verdict.
    const result = results.get(id);
    if (result?.verdict === 'slop' && result.confidence >= slopThreshold()) {
      renderDimmed(
        el,
        `slop · ${Math.round(result.confidence * 100)}%`,
        `${result.reason || 'Flagged by filter'} (click to toggle)`
      );
      return;
    }

    clearMarks(el);
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
    // storageLoaded guards the startup race: the MutationObserver can fire
    // before the allowlist/prefs arrive, and filtering against an empty
    // allowlist would hide allowlisted channels.
    if (!storageLoaded || !prefs.filteringEnabled) return;
    document.querySelectorAll(CONTAINER_SELECTOR).forEach((el) => {
      const video = extractVideo(el);
      if (!video) return;
      // YouTube recycles renderer elements across SPA navigations, so an
      // element's video can change; re-tag instead of skipping seen elements.
      if (el.dataset.ytcId !== video.id) {
        el.dataset.ytcId = video.id;
        clearMarks(el);
        el.dataset.ytcChannel = video.channel;
        if (video.channelPath) el.dataset.ytcChannelPath = video.channelPath;
        else delete el.dataset.ytcChannelPath;
      } else {
        // Same video: bylines render lazily, so a re-scan can extract an empty
        // channel. Keep previously captured values instead of erasing them.
        if (video.channel) el.dataset.ytcChannel = video.channel;
        if (video.channelPath) el.dataset.ytcChannelPath = video.channelPath;
      }

      scoreVideo(video);
      applyVerdict(el);

      // Only spend an LLM call on videos the heuristics didn't already flag.
      if (
        slopScore(el) < prefs.slop.dimThreshold &&
        !results.has(video.id) &&
        !pending.has(video.id) &&
        !failed.has(video.id) &&
        !isAllowed(el.dataset.ytcChannel, el.dataset.ytcChannelPath)
      ) {
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

  chrome.storage.local.get(['ytc.preferences', ALLOWLIST_KEY], (stored) => {
    prefs = mergePrefs(stored?.['ytc.preferences']);
    allowlist = stored?.[ALLOWLIST_KEY] ?? [];
    storageLoaded = true;
    if (prefs.filteringEnabled) scan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[ALLOWLIST_KEY]) {
      allowlist = changes[ALLOWLIST_KEY].newValue ?? [];
      applyAll();
    }
    if (changes['ytc.preferences']) {
      const previousKeywords = prefs.blacklistKeywords;
      prefs = mergePrefs(changes['ytc.preferences'].newValue);
      rescoreAll(); // weights may have changed
      // The blacklist is enforced in background.js, ahead of its cache, so a
      // changed list only takes effect if we drop the verdicts we already hold:
      // scan() skips any video with a result, and this map outlives SPA
      // navigation.
      if (!sameList(previousKeywords, prefs.blacklistKeywords)) {
        results.clear();
        failed.clear();
      }
      applyAll(); // re-evaluate thresholds/enabled without reclassifying
      if (prefs.filteringEnabled) scheduleScan();
    }
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
