// Pure inbox-building logic for the Discovery module (Module 3).
// No DOM/chrome access — inputs are the raw rows read from IndexedDB.
import { extractVideoId } from '../utils/youtube.js';

// classifications: rows from the `classifications` store
//   { videoId, title, channel, verdict, confidence, reason, durationSeconds,
//     classifiedAt, promptVersion }
// videos: rows from the `videos` store
//   { id, url, title, channel, tags, savedAt, notes }
// dismissals: rows from the `discovery` store
//   { videoId, status, at }
//
// Returns Suggestion[]: { videoId, title, channel, confidence, reason,
//   durationSeconds, classifiedAt } sorted newest classifiedAt first.
export function buildInbox(classifications, videos, dismissals) {
  const libraryIds = new Set(
    (videos ?? []).map((v) => extractVideoId(v.url)).filter(Boolean)
  );
  const dismissedIds = new Set((dismissals ?? []).map((d) => d.videoId));

  return (classifications ?? [])
    .filter((c) => c.verdict === 'quality')
    .filter((c) => !libraryIds.has(c.videoId) && !dismissedIds.has(c.videoId))
    .map((c) => ({
      videoId: c.videoId,
      title: c.title ?? '',
      channel: c.channel ?? '',
      confidence: c.confidence ?? 0,
      reason: c.reason ?? '',
      durationSeconds: c.durationSeconds ?? null,
      classifiedAt: c.classifiedAt ?? '',
    }))
    .sort((a, b) => b.classifiedAt.localeCompare(a.classifiedAt));
}
