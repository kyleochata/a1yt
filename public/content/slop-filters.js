// Slop-filter CONFIG ONLY — phrases, regexes, weights, thresholds.
// Matcher logic lives in slop-score.js; tuning happens here and never there.
//
// Loaded as a classic content script before slop-score.js (see manifest.json).
// Also loadable in Node (tests) via node:vm with a plain object as `self`.

(function (root) {
  const config = {
    // Videos scoring >= hide collapse to a placeholder; >= dim (but < hide)
    // are dimmed. Both are overridable from preferences (prefs.slop).
    thresholds: { hide: 10, dim: 6 },

    // Tier 1 — high-confidence phrases. Substring match on the normalized
    // (NFKC, lowercased, emoji-stripped) title. Weight is per matched phrase,
    // so one hit reaches the default hide threshold on its own.
    tier1: {
      weight: 10,
      phrases: [
        "you won't believe",
        'you wont believe',
        'will shock you',
        'will leave you speechless',
        "scientists can't explain",
        'scientists cant explain',
        "scientists don't want you to know",
        "they don't want you to know",
        'the terrifying truth',
        'the disturbing truth',
        'the dark truth about',
        'what happens next will',
        "before it's deleted",
        'before its deleted',
        "watch before it's taken down",
        'no one is talking about',
        'nobody is talking about',
        'will give you chills',
        'left everyone speechless',
      ],
    },

    // Tier 2 — structural regexes, applied to the normalized title.
    tier2: {
      weight: 6,
      patterns: [
        {
          name: 'fear-listicle-opener',
          re: /^\d+\s+(mysterious|terrifying|disturbing|creepy|shocking|unbelievable|insane|bizarre|scary|horrifying|chilling)\b/i,
        },
        {
          name: 'science-cant-explain',
          re: /\b(that|which)\s+(science|history|experts?|scientists?)\s+(can'?t|cannot)\s+explain\b/i,
        },
        {
          name: 'top-x-you-didnt-know',
          re: /\btop\s+\d+\b.*\byou\s+didn'?t\s+know\b/i,
        },
        {
          name: 'facts-that-will',
          re: /\b(facts|moments|things)\s+that\s+(will|prove|show)\b/i,
        },
        {
          name: 'clickbait-parenthetical',
          re: /\((real|not\s*clickbait|must\s*watch|gone\s*wrong|shocking)\)/i,
        },
        {
          name: 'ai-reveals-what',
          re: /\bai\s+(reveals|shows)\s+what\b/i,
        },
      ],
    },

    // Non-regex structural checks (implemented in slop-score.js).
    structural: {
      weight: 4,
      // ALL-CAPS density: this many fully-capitalized words of length >= capsMinLength
      // that are not whitelisted acronyms. Checked on the NFKC'd ORIGINAL title.
      capsMinWords: 3,
      capsMinLength: 4,
      acronyms: [
        'NASA', 'GPU', 'CPU', 'USA', 'NBA', 'NFL', 'MLB', 'NHL', 'FIFA', 'UEFA',
        'HTML', 'CSS', 'JSON', 'HTTP', 'HTTPS', 'API', 'SQL', 'AWS', 'IBM',
        'DIY', 'ASMR', 'NASCAR', 'WWE', 'UFC', 'FBI', 'CIA', 'NATO', 'LEGO',
        'IMAX', 'RTX', 'GTX', 'SSD', 'HDMI', 'USB', 'LIVE', 'OLED', 'MKBHD',
      ],
      // Emoji spam: >= emojiMinCount emoji from emojiSet, or emoji at both
      // the start and the end of the title.
      emojiMinCount: 2,
      emojiSet: ['😱', '🤯', '💀', '🔥', '⚠️', '❗', '😨', '😰'],
    },

    // Tier 3 — topic clusters. Score-contributors only, never hard-blocks.
    // `all` = one substring from EACH group must match; `any` = one match total.
    tier3: [
      { name: 'ancient-forbidden', weight: 3, all: [['ancient'], ['forbidden', 'hidden', 'lost']] },
      {
        name: 'deep-sea-fear',
        weight: 3,
        all: [['deep sea', 'mariana trench'], ['terrifying', 'scary', 'horrifying', 'creepy']],
      },
      { name: 'sigma-grindset', weight: 3, all: [['sigma'], ['rules', 'motivation']] },
      { name: 'reddit-stories', weight: 3, any: ['reddit stories', 'aita', 'r/'] },
      { name: 'gone-wrong', weight: 2, any: ['gone wrong'] },
      { name: 'caught-on-camera', weight: 2, any: ['caught on camera'] },
      { name: 'unexplained-mysterious', weight: 2, any: ['unexplained', 'mysterious'] },
    ],

    // Tier 4 — channel-level heuristics (computed in slop-channel.js from a
    // channel's /videos tab, cached ~7 days).
    channel: {
      cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
      recentVideos: 30, // window for cadence / skeleton stats
      longFormMinSeconds: 8 * 60,
      cadencePerDayThreshold: 1, // > 1 long-form upload/day on average
      cadenceWeight: 10,
      skeletonMinRepeats: 3, // same title skeleton 3+ times in recent uploads
      skeletonChannelWeight: 8,
      skeletonGlobalWeight: 4, // same skeleton seen on another channel
    },
  };

  root.YTC_SLOP_CONFIG = config;
})(typeof self !== 'undefined' ? self : globalThis);
