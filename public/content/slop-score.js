// Slop-filter MATCHER — pure functions over titles + channel stats.
// All tunable data lives in slop-filters.js (YTC_SLOP_CONFIG); this file
// should not need edits when tuning weights or adding phrases.
//
// Classic content script; also loadable in Node (tests) via node:vm.

(function (root) {
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const EMOJI_RE_G = /\p{Extended_Pictographic}/gu;

  // Per-config compiled lookups (acronym set, emoji set), built once.
  const compiled = new WeakMap();
  function lookups(config) {
    let c = compiled.get(config);
    if (!c) {
      c = {
        acronyms: new Set(config.structural.acronyms.map((a) => a.toUpperCase())),
        emojiSet: new Set(config.structural.emojiSet.map((e) => e.replace(/\uFE0F/g, ''))),
      };
      compiled.set(config, c);
    }
    return c;
  }

  /**
   * NFKC-fold (defeats 𝗳𝗮𝗻𝗰𝘆 unicode fonts), straighten curly quotes.
   * Returns:
   *   nfkc  — folded title, original casing + emoji (for caps/emoji checks)
   *   plain — lowercased, emoji stripped, whitespace collapsed (for phrase/regex matching)
   *   emojis — extracted emoji, variation selectors removed
   */
  function normalizeTitle(raw) {
    const nfkc = String(raw ?? '')
      .normalize('NFKC')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .trim();
    const emojis = Array.from(nfkc.matchAll(EMOJI_RE_G), (m) => m[0].replace(/\uFE0F/g, ''));
    const plain = nfkc
      .toLowerCase()
      .replace(EMOJI_RE_G, ' ')
      .replace(/\uFE0F/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { nfkc, plain, emojis };
  }

  function allCapsWordCount(nfkc, config) {
    const { acronyms } = lookups(config);
    let count = 0;
    for (const word of nfkc.split(/\s+/)) {
      const letters = word.replace(/[^A-Za-z]/g, '');
      if (letters.length < config.structural.capsMinLength) continue;
      if (letters !== letters.toUpperCase()) continue;
      if (acronyms.has(letters)) continue;
      count += 1;
    }
    return count;
  }

  function emojiSpam(nfkc, emojis, config) {
    const { emojiSet } = lookups(config);
    const spamCount = emojis.filter((e) => emojiSet.has(e)).length;
    if (spamCount >= config.structural.emojiMinCount) return true;
    const startsWith = EMOJI_RE.test(nfkc.slice(0, 4));
    const endsWith = EMOJI_RE.test(nfkc.slice(-4));
    return emojis.length >= 2 && startsWith && endsWith;
  }

  function matchesCluster(plain, cluster) {
    if (cluster.any) return cluster.any.some((s) => plain.includes(s));
    return cluster.all.every((group) => group.some((s) => plain.includes(s)));
  }

  /**
   * Score a single title against tiers 1–3.
   * `weights` (optional, from user prefs) overrides per-tier weights:
   *   { tier1, tier2, structural, topicMultiplier }
   * Returns { score, signals: [{ tier, name, weight }] }.
   */
  function scoreTitle(title, config, weights) {
    const w = {
      tier1: config.tier1.weight,
      tier2: config.tier2.weight,
      structural: config.structural.weight,
      topicMultiplier: 1,
      ...(weights || {}),
    };
    const { nfkc, plain, emojis } = normalizeTitle(title);
    const signals = [];

    for (const phrase of config.tier1.phrases) {
      if (plain.includes(phrase)) signals.push({ tier: 1, name: `phrase:${phrase}`, weight: w.tier1 });
    }
    for (const { name, re } of config.tier2.patterns) {
      if (re.test(plain)) signals.push({ tier: 2, name, weight: w.tier2 });
    }
    if (allCapsWordCount(nfkc, config) >= config.structural.capsMinWords) {
      signals.push({ tier: 2, name: 'all-caps-density', weight: w.structural });
    }
    if (emojiSpam(nfkc, emojis, config)) {
      signals.push({ tier: 2, name: 'emoji-spam', weight: w.structural });
    }
    for (const cluster of config.tier3) {
      if (matchesCluster(plain, cluster)) {
        signals.push({ tier: 3, name: cluster.name, weight: cluster.weight * w.topicMultiplier });
      }
    }

    return { score: signals.reduce((sum, s) => sum + s.weight, 0), signals };
  }

  /**
   * Score tier-4 channel stats (produced by slop-channel.js):
   *   { longFormPerDay, maxSkeletonRepeats, sharedSkeletonGlobally }
   * `weights` (optional): { channelMultiplier } scales all tier-4 weights.
   */
  function scoreChannelStats(stats, config, weights) {
    const signals = [];
    if (!stats) return { score: 0, signals };
    const mult = weights?.channelMultiplier ?? 1;
    const ch = config.channel;
    if (stats.longFormPerDay > ch.cadencePerDayThreshold) {
      signals.push({ tier: 4, name: 'upload-cadence', weight: ch.cadenceWeight * mult });
    }
    if (stats.maxSkeletonRepeats >= ch.skeletonMinRepeats) {
      signals.push({ tier: 4, name: 'title-skeleton-repetition', weight: ch.skeletonChannelWeight * mult });
    }
    if (stats.sharedSkeletonGlobally) {
      signals.push({ tier: 4, name: 'title-skeleton-cross-channel', weight: ch.skeletonGlobalWeight * mult });
    }
    return { score: signals.reduce((sum, s) => sum + s.weight, 0), signals };
  }

  /**
   * Reduce a title to a template "skeleton": digits -> '#', capitalized words
   * (cheap proper-noun proxy) -> '*', rest lowercased with punctuation dropped.
   * Returns null when too little concrete text survives (e.g. ALL-CAPS titles),
   * so over-generic skeletons never match each other.
   */
  function titleSkeleton(title) {
    const { nfkc } = normalizeTitle(title);
    const words = nfkc
      .replace(EMOJI_RE_G, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}']/gu, ''))
      .filter(Boolean);
    if (words.length < 4) return null;

    // In sentence-case titles a mid-title capital is a decent proper-noun
    // signal; in Title Case Everything Is Capitalized, so skip the proxy
    // there or the whole skeleton degenerates to wildcards.
    const capRatio = words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length;
    const stripProperNouns = capRatio < 0.6;

    const tokens = words.map((w, i) => {
      if (/\d/.test(w)) return '#';
      if (stripProperNouns && i > 0 && /^\p{Lu}/u.test(w)) return '*';
      return w.toLowerCase();
    });
    const concrete = tokens.filter((t) => t !== '#' && t !== '*').length;
    if (concrete < 2) return null;
    return tokens.join(' ');
  }

  root.YTC_SLOP_SCORE = { normalizeTitle, scoreTitle, scoreChannelStats, titleSkeleton };
})(typeof self !== 'undefined' ? self : globalThis);
