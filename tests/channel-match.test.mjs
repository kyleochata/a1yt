// Unit tests for channel-entry normalization/matching (public/content/channel-match.js).
// Classic (non-module) script, so it's evaluated in a node:vm context here.
// Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
const source = readFileSync(
  new URL('../public/content/channel-match.js', import.meta.url),
  'utf8'
);
vm.runInContext(source, context, { filename: 'channel-match.js' });

const { normalizeChannel, channelMatches } = context.YTC_CHANNEL_MATCH;

test('normalizeChannel strips URL prefixes, slashes, and @', () => {
  assert.equal(normalizeChannel('@Foo'), 'foo');
  assert.equal(normalizeChannel('youtube.com/@foo'), 'foo');
  assert.equal(normalizeChannel('https://www.youtube.com/@Foo/'), 'foo');
  assert.equal(normalizeChannel('www.youtube.com/@foo'), 'foo');
  assert.equal(normalizeChannel('/@veritasium'), 'veritasium');
  assert.equal(normalizeChannel('/channel/UCxyz'), 'channel/ucxyz');
  assert.equal(normalizeChannel('youtube.com/channel/UCxyz'), 'channel/ucxyz');
});

test('normalizeChannel leaves display names as trim+lowercase', () => {
  assert.equal(normalizeChannel('  Veritasium  '), 'veritasium');
  assert.equal(normalizeChannel('Linus Tech Tips'), 'linus tech tips');
});

test('normalizeChannel returns empty string for empty input', () => {
  assert.equal(normalizeChannel(''), '');
  assert.equal(normalizeChannel('   '), '');
  assert.equal(normalizeChannel(null), '');
  assert.equal(normalizeChannel(undefined), '');
});

test('channelMatches matches handle and URL entries via channelPath', () => {
  assert.ok(channelMatches('@veritasium', 'Veritasium', '/@veritasium'));
  assert.ok(channelMatches('youtube.com/@veritasium', 'Veritasium', '/@veritasium'));
  assert.ok(channelMatches('https://www.youtube.com/@MKBHD/', 'Marques Brownlee', '/@MKBHD'));
  assert.ok(channelMatches('youtube.com/channel/UCxyz', 'Some Channel', '/channel/UCxyz'));
});

test('channelMatches matches display-name entries', () => {
  assert.ok(channelMatches('Veritasium', 'Veritasium', '/@veritasium'));
  assert.ok(channelMatches('  linus tech tips ', 'Linus Tech Tips', '/@LinusTechTips'));
  // Missing channelPath (extraction fallback) still matches by name.
  assert.ok(channelMatches('Veritasium', 'Veritasium', undefined));
});

test('channelMatches matches path-form entries even with an empty display name', () => {
  // The allowlist button stores the /@handle path alongside the name; cards
  // whose byline hasn't rendered yet expose only the channelPath.
  assert.ok(channelMatches('/@foobar', '', '/@foobar'));
  assert.ok(channelMatches('/@foobar', 'Foo Bar', '/@foobar'));
  assert.ok(!channelMatches('/@foobar', 'Foo Bar', '/@someoneelse'));
});

test('channelMatches rejects non-matching and empty entries', () => {
  assert.ok(!channelMatches('@veritasium', 'Veritas', '/@veritas'));
  assert.ok(!channelMatches('', 'Veritasium', '/@veritasium'));
  assert.ok(!channelMatches('   ', 'Veritasium', '/@veritasium'));
  // Display name and handle are distinct identifiers, matched separately.
  assert.ok(!channelMatches('mr beast', 'MrBeast', '/@mrbeast'));
});
