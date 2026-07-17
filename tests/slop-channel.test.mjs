// Unit tests for the duration parser (public/content/slop-channel.js), which
// is now shared: classifier.js reuses it for per-video duration extraction
// (see src/discovery/inbox.js and VideoCard/SuggestionCard).
// Classic (non-module) script, so it's evaluated in a node:vm context here.
// Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const context = vm.createContext({});
const source = readFileSync(
  new URL('../public/content/slop-channel.js', import.meta.url),
  'utf8'
);
vm.runInContext(source, context, { filename: 'slop-channel.js' });

const { parseDurationSeconds } = context.YTC_SLOP_CHANNEL;

test('parseDurationSeconds parses mm:ss and h:mm:ss', () => {
  assert.equal(parseDurationSeconds('12:34'), 754);
  assert.equal(parseDurationSeconds('1:02:03'), 3723);
  assert.equal(parseDurationSeconds('0:05'), 5);
});

test('parseDurationSeconds returns null for garbage or empty input', () => {
  assert.equal(parseDurationSeconds(''), null);
  assert.equal(parseDurationSeconds('LIVE'), null);
  assert.equal(parseDurationSeconds('not a duration'), null);
  assert.equal(parseDurationSeconds(undefined), null);
});
