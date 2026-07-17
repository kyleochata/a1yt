// Unit tests for the heuristic slop scorer (public/content/slop-*.js).
// The content scripts are classic (non-module) scripts that attach to `self`,
// so they're evaluated in a node:vm context here. Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
for (const file of ['slop-filters.js', 'slop-score.js']) {
  const source = readFileSync(new URL(`../public/content/${file}`, import.meta.url), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

const config = context.YTC_SLOP_CONFIG;
const { normalizeTitle, scoreTitle, scoreChannelStats, titleSkeleton } = context.YTC_SLOP_SCORE;
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/titles.json', import.meta.url), 'utf8'));

const HIDE = config.thresholds.hide;
const DIM = config.thresholds.dim;

function describeScore(title) {
  const { score, signals } = scoreTitle(title, config);
  return `"${title}" scored ${score} [${signals.map((s) => s.name).join(', ') || 'no signals'}]`;
}

test('slop fixtures score at or above the hide threshold', () => {
  for (const title of fixtures.slop) {
    const { score } = scoreTitle(title, config);
    assert.ok(score >= HIDE, `expected >= ${HIDE}: ${describeScore(title)}`);
  }
});

test('dim-band fixtures land in [dim, hide)', () => {
  for (const title of fixtures.dimBand) {
    const { score } = scoreTitle(title, config);
    assert.ok(score >= DIM && score < HIDE, `expected ${DIM}..${HIDE - 1}: ${describeScore(title)}`);
  }
});

test('legit (even clickbait-ish) fixtures are never hidden', () => {
  for (const title of fixtures.legit) {
    const { score } = scoreTitle(title, config);
    assert.ok(score < HIDE, `expected < ${HIDE}: ${describeScore(title)}`);
  }
});

test('normalization folds fancy unicode and curly quotes', () => {
  const { plain } = normalizeTitle('𝗬𝗼𝘂 𝗪𝗼𝗻’𝘁 𝗕𝗲𝗹𝗶𝗲𝘃𝗲 𝗧𝗵𝗶𝘀');
  assert.equal(plain, "you won't believe this");
});

test('normalization strips emoji from plain but extracts them', () => {
  const { plain, emojis } = normalizeTitle('😱 Scary Video 😱🔥');
  assert.equal(plain, 'scary video');
  assert.deepEqual([...emojis], ['😱', '😱', '🔥']); // copy: vm-realm arrays fail strict proto checks
});

test('all-caps density fires past 3 non-acronym words, not on acronyms', () => {
  const caps = scoreTitle('THIS INSANE MACHINE DESTROYS Everything', config);
  assert.ok(caps.signals.some((s) => s.name === 'all-caps-density'));
  const acronyms = scoreTitle('NASA GPU HTML Benchmarks Are Here', config);
  assert.ok(!acronyms.signals.some((s) => s.name === 'all-caps-density'));
});

test('emoji at both ends counts as spam even outside the scare set', () => {
  const result = scoreTitle('🎮 My Minecraft World Tour 🎮', config);
  assert.ok(result.signals.some((s) => s.name === 'emoji-spam'));
});

test('weight overrides scale the score', () => {
  const title = 'This New AI Will Shock You'; // single tier-1 hit
  assert.equal(scoreTitle(title, config).score, config.tier1.weight);
  assert.equal(scoreTitle(title, config, { tier1: 3 }).score, 3);
});

test('titleSkeleton collapses numbers and proper nouns into a template', () => {
  const a = titleSkeleton('The terrifying case of Jonathan Miller explained');
  const b = titleSkeleton('The terrifying case of Sarah Brennan explained');
  assert.ok(a !== null);
  assert.equal(a, b);
  assert.equal(
    titleSkeleton('Top 10 Scariest Ghost Sightings'),
    titleSkeleton('Top 25 Scariest Ghost Sightings')
  );
});

test('titleSkeleton returns null for short or contentless titles', () => {
  assert.equal(titleSkeleton('Hello World'), null);
  assert.equal(titleSkeleton('😱😱 🔥 💀'), null);
});

test('scoreChannelStats applies tier-4 weights', () => {
  const hot = scoreChannelStats(
    { longFormPerDay: 2.5, maxSkeletonRepeats: 4, sharedSkeletonGlobally: true },
    config
  );
  assert.equal(
    hot.score,
    config.channel.cadenceWeight + config.channel.skeletonChannelWeight + config.channel.skeletonGlobalWeight
  );
  const calm = scoreChannelStats(
    { longFormPerDay: 0.2, maxSkeletonRepeats: 1, sharedSkeletonGlobally: false },
    config
  );
  assert.equal(calm.score, 0);
  assert.equal(scoreChannelStats(null, config).score, 0);
});
