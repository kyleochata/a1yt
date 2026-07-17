// Tier 4 — channel-level slop heuristics.
//
// The first time a channel shows up in the feed we fetch its /videos tab
// (same-origin fetch from the content script), parse ytInitialData, and
// compute upload-cadence + title-skeleton stats. Results are cached in
// chrome.storage.local for ~7 days (config.channel.cacheTtlMs); parse
// failures are cached for 1 day so a broken page doesn't get re-fetched on
// every scroll. Thumbnail perceptual hashing from the spec is intentionally
// skipped (marked optional/stretch there).
//
// A small global skeleton table ('ytc.skeletons') records each channel's
// repeated title templates so template reuse ACROSS channels can be scored.

(function (root) {
  const STATS_KEY = 'ytc.channelStats';
  const SKELETON_KEY = 'ytc.skeletons';
  const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_STATS_ENTRIES = 500;
  const MAX_SKELETON_ENTRIES = 1500;

  const inflight = new Map(); // channelPath -> Promise<stats|null>

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (v) => resolve(v?.[key] ?? {}));
      } catch {
        resolve({});
      }
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  /* ---- parsing helpers ---- */

  const AGE_UNIT_DAYS = {
    second: 1 / 86400,
    minute: 1 / 1440,
    hour: 1 / 24,
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };

  // "3 days ago", "Streamed 2 weeks ago" -> age in days, or null.
  function parseAgeDays(text) {
    const match = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/.exec(text ?? '');
    return match ? Number(match[1]) * AGE_UNIT_DAYS[match[2]] : null;
  }

  // "12:34" / "1:02:03" -> seconds, or null.
  function parseDurationSeconds(text) {
    const parts = (text ?? '').trim().split(':');
    if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return null;
    return parts.reduce((total, p) => total * 60 + Number(p), 0);
  }

  function extractInitialData(html) {
    const start = html.indexOf('var ytInitialData = ');
    if (start === -1) return null;
    const jsonStart = start + 'var ytInitialData = '.length;
    const end = html.indexOf(';</script>', jsonStart);
    if (end === -1) return null;
    try {
      return JSON.parse(html.slice(jsonStart, end));
    } catch {
      return null;
    }
  }

  // The channel's canonical UC… id. One channel is reachable as "/@handle",
  // "/channel/UC…", "/c/…" and "/user/…", and different feed layouts hand us
  // different forms — keying the skeleton table by the raw path would count a
  // single channel's own templates as reuse ACROSS channels.
  function extractChannelId(data) {
    const id =
      data?.metadata?.channelMetadataRenderer?.externalId ??
      data?.header?.c4TabbedHeaderRenderer?.channelId ??
      data?.microformat?.microformatDataRenderer?.urlCanonical?.match(/\/channel\/(UC[\w-]+)/)?.[1];
    return typeof id === 'string' && id ? id : null;
  }

  // Depth-first walk collecting videoRenderer nodes wherever YouTube nests them.
  function collectVideoRenderers(node, out, limit) {
    if (!node || typeof node !== 'object' || out.length >= limit) return;
    if (node.videoRenderer && typeof node.videoRenderer === 'object') {
      out.push(node.videoRenderer);
      if (out.length >= limit) return;
    }
    for (const value of Object.values(node)) collectVideoRenderers(value, out, limit);
  }

  /* ---- stats computation ---- */

  function computeStats(renderers, config) {
    const ch = config.channel;
    const recent = renderers.slice(0, ch.recentVideos).map((r) => ({
      title: r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? '',
      ageDays: parseAgeDays(r.publishedTimeText?.simpleText),
      seconds: parseDurationSeconds(
        r.lengthText?.simpleText ?? r.thumbnailOverlays?.[0]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText
      ),
    }));
    if (recent.length < 5) return null; // too little data to judge a channel

    const ages = recent.map((v) => v.ageDays).filter((a) => a !== null);
    const spanDays = ages.length >= 2 ? Math.max(...ages, 1) : null;
    const longFormCount = recent.filter((v) => (v.seconds ?? 0) > ch.longFormMinSeconds).length;
    const longFormPerDay = spanDays ? longFormCount / spanDays : 0;

    const skeletonCounts = new Map();
    for (const v of recent) {
      const skeleton = root.YTC_SLOP_SCORE.titleSkeleton(v.title);
      if (skeleton) skeletonCounts.set(skeleton, (skeletonCounts.get(skeleton) ?? 0) + 1);
    }
    const maxSkeletonRepeats = Math.max(0, ...skeletonCounts.values());
    const templates = [...skeletonCounts.entries()].filter(([, n]) => n >= 2).map(([s]) => s);

    return { longFormPerDay, maxSkeletonRepeats, templates, videosSeen: recent.length };
  }

  // Record this channel's repeated templates globally; report whether any of
  // them was already recorded for a DIFFERENT channel. `channelKey` must be
  // canonical (see extractChannelId) — two keys for one channel would make it
  // look like it were sharing templates with itself.
  async function updateSkeletonTable(channelKey, templates, now) {
    const table = await storageGet(SKELETON_KEY);
    let shared = false;
    for (const skeleton of templates) {
      const entry = table[skeleton] ?? { channels: [], seenAt: now };
      if (entry.channels.some((c) => c !== channelKey)) shared = true;
      if (!entry.channels.includes(channelKey)) entry.channels = [...entry.channels, channelKey].slice(0, 5);
      entry.seenAt = now;
      table[skeleton] = entry;
    }
    const keys = Object.keys(table);
    if (keys.length > MAX_SKELETON_ENTRIES) {
      keys
        .sort((a, b) => (table[a].seenAt ?? 0) - (table[b].seenAt ?? 0))
        .slice(0, keys.length - MAX_SKELETON_ENTRIES)
        .forEach((k) => delete table[k]);
    }
    if (templates.length > 0) await storageSet(SKELETON_KEY, table);
    return shared;
  }

  async function fetchStats(channelPath, config) {
    let stats = null;
    let channelId = null;
    try {
      const res = await fetch(`${location.origin}${channelPath}/videos`);
      if (res.ok) {
        const data = extractInitialData(await res.text());
        if (data) {
          const renderers = [];
          collectVideoRenderers(data, renderers, config.channel.recentVideos + 10);
          stats = computeStats(renderers, config);
          channelId = extractChannelId(data);
        }
      }
    } catch {
      // network error / page shape change — treated as "no stats"
    }
    if (stats) {
      // channelPath is only a fallback: if the id is ever missing we'd rather
      // score the channel than drop its templates on the floor.
      stats.sharedSkeletonGlobally = await updateSkeletonTable(
        channelId ?? channelPath,
        stats.templates,
        Date.now()
      );
      delete stats.templates;
    }
    return stats;
  }

  /* ---- public API ---- */

  /**
   * Stats for a channel, from cache or a lazy fetch of its /videos tab.
   * `channelPath` is a root-relative URL like "/@somehandle" or "/channel/UC…".
   * Resolves to { longFormPerDay, maxSkeletonRepeats, sharedSkeletonGlobally,
   * videosSeen } or null when the channel can't be parsed.
   */
  async function getChannelStats(channelPath, config) {
    if (!channelPath || !/^\/(@|channel\/|c\/|user\/)/.test(channelPath)) return null;
    if (inflight.has(channelPath)) return inflight.get(channelPath);

    const promise = (async () => {
      const cache = await storageGet(STATS_KEY);
      const cached = cache[channelPath];
      const now = Date.now();
      if (cached) {
        const ttl = cached.stats ? config.channel.cacheTtlMs : FAILURE_TTL_MS;
        if (now - cached.fetchedAt < ttl) return cached.stats;
      }

      const stats = await fetchStats(channelPath, config);

      // Re-read before writing: another tab may have added entries meanwhile.
      const fresh = await storageGet(STATS_KEY);
      fresh[channelPath] = { fetchedAt: now, stats };
      const keys = Object.keys(fresh);
      if (keys.length > MAX_STATS_ENTRIES) {
        keys
          .sort((a, b) => (fresh[a].fetchedAt ?? 0) - (fresh[b].fetchedAt ?? 0))
          .slice(0, keys.length - MAX_STATS_ENTRIES)
          .forEach((k) => delete fresh[k]);
      }
      await storageSet(STATS_KEY, fresh);
      return stats;
    })().finally(() => inflight.delete(channelPath));

    inflight.set(channelPath, promise);
    return promise;
  }

  root.YTC_SLOP_CHANNEL = { getChannelStats, parseDurationSeconds };
})(typeof self !== 'undefined' ? self : globalThis);
