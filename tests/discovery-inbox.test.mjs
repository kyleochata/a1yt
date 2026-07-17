// Guards the Discovery module's pure inbox-building logic (src/discovery/inbox.js)
// and the URL parser it depends on (src/utils/youtube.js).
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildInbox } from '../src/discovery/inbox.js';
import { extractVideoId, watchUrlFor } from '../src/utils/youtube.js';

test('extractVideoId parses watch, youtu.be, and shorts URLs', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk');
  assert.equal(
    extractVideoId('https://www.youtube.com/watch?list=PL123&v=abcdefghijk&t=30s'),
    'abcdefghijk'
  );
  assert.equal(extractVideoId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
  assert.equal(extractVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
});

test('extractVideoId returns null for unparsable or non-YouTube input without throwing', () => {
  assert.equal(extractVideoId('not a url'), null);
  assert.equal(extractVideoId('https://example.com/watch'), null);
  assert.equal(extractVideoId(''), null);
  assert.equal(extractVideoId(undefined), null);
  assert.equal(extractVideoId(null), null);
});

test('watchUrlFor builds a canonical watch URL', () => {
  assert.equal(watchUrlFor('abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
});

function classification(overrides) {
  return {
    videoId: 'vid00000001',
    title: 'Some quality video',
    channel: 'Some Channel',
    verdict: 'quality',
    confidence: 0.8,
    reason: 'well-sourced',
    durationSeconds: 754,
    classifiedAt: '2026-07-10T00:00:00.000Z',
    promptVersion: 1,
    ...overrides,
  };
}

test('buildInbox keeps only quality verdicts', () => {
  const classifications = [
    classification({ videoId: 'vid00000001', verdict: 'quality' }),
    classification({ videoId: 'vid00000002', verdict: 'neutral' }),
    classification({ videoId: 'vid00000003', verdict: 'slop' }),
  ];
  const result = buildInbox(classifications, [], []);
  assert.deepEqual(result.map((s) => s.videoId), ['vid00000001']);
});

test('buildInbox excludes videos already in the library across URL shapes', () => {
  const classifications = [
    classification({ videoId: 'vid00000001' }),
    classification({ videoId: 'vid00000002' }),
    classification({ videoId: 'vid00000003' }),
  ];
  const videos = [
    { url: 'https://www.youtube.com/watch?v=vid00000001&t=10s' },
    { url: 'https://youtu.be/vid00000002' },
    { url: 'not a real url' }, // should be ignored, not throw
  ];
  const result = buildInbox(classifications, videos, []);
  assert.deepEqual(result.map((s) => s.videoId), ['vid00000003']);
});

test('buildInbox excludes dismissed videoIds', () => {
  const classifications = [
    classification({ videoId: 'vid00000001' }),
    classification({ videoId: 'vid00000002' }),
  ];
  const dismissals = [{ videoId: 'vid00000001', status: 'dismissed', at: '2026-07-11T00:00:00.000Z' }];
  const result = buildInbox(classifications, [], dismissals);
  assert.deepEqual(result.map((s) => s.videoId), ['vid00000002']);
});

test('buildInbox sorts newest classifiedAt first', () => {
  const classifications = [
    classification({ videoId: 'vid00000001', classifiedAt: '2026-07-01T00:00:00.000Z' }),
    classification({ videoId: 'vid00000002', classifiedAt: '2026-07-15T00:00:00.000Z' }),
    classification({ videoId: 'vid00000003', classifiedAt: '2026-07-08T00:00:00.000Z' }),
  ];
  const result = buildInbox(classifications, [], []);
  assert.deepEqual(result.map((s) => s.videoId), ['vid00000002', 'vid00000003', 'vid00000001']);
});

test('buildInbox passes through entries missing reason, and stale promptVersion still surfaces', () => {
  const classifications = [
    classification({ videoId: 'vid00000001', reason: undefined, promptVersion: 0 }),
  ];
  const result = buildInbox(classifications, [], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, '');
});

test('buildInbox passes durationSeconds through unchanged, defaulting to null when absent', () => {
  const classifications = [
    classification({ videoId: 'vid00000001', durationSeconds: 754 }),
    classification({ videoId: 'vid00000002', durationSeconds: undefined }),
  ];
  const result = buildInbox(classifications, [], []);
  assert.equal(result.find((s) => s.videoId === 'vid00000001').durationSeconds, 754);
  assert.equal(result.find((s) => s.videoId === 'vid00000002').durationSeconds, null);
});
