// Unit tests for the app-side duration helpers (src/utils/duration.js), used
// by VideoCard/SuggestionCard for display and VideoForm for manual entry.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, parseDurationInput } from '../src/utils/duration.js';

test('formatDuration renders mm:ss under an hour', () => {
  assert.equal(formatDuration(754), '12:34');
  assert.equal(formatDuration(5), '0:05');
});

test('formatDuration renders h:mm:ss at or past an hour, zero-padded', () => {
  assert.equal(formatDuration(3723), '1:02:03');
  assert.equal(formatDuration(3600), '1:00:00');
});

test('formatDuration returns null for missing or invalid input', () => {
  assert.equal(formatDuration(null), null);
  assert.equal(formatDuration(undefined), null);
  assert.equal(formatDuration(-5), null);
  assert.equal(formatDuration(NaN), null);
  assert.equal(formatDuration('12:34'), null);
});

test('parseDurationInput is the inverse of formatDuration for valid strings', () => {
  assert.equal(parseDurationInput('12:34'), 754);
  assert.equal(parseDurationInput('1:02:03'), 3723);
  assert.equal(parseDurationInput('0:05'), 5);
});

test('parseDurationInput returns null for garbage, empty, or too many parts', () => {
  assert.equal(parseDurationInput(''), null);
  assert.equal(parseDurationInput('not a duration'), null);
  assert.equal(parseDurationInput('1:02:03:04'), null);
  assert.equal(parseDurationInput(undefined), null);
});
