// Duration formatting/parsing for the app side. A separate copy from the
// content script's parseDurationSeconds (public/content/slop-channel.js) —
// classic scripts can't be imported into ESM (see src/utils/youtube.js).

export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// "12:34" / "1:02:03" -> seconds, or null.
export function parseDurationInput(text) {
  const parts = (text ?? '').trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}
