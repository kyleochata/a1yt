// URL <-> videoId helpers for the app side (library, discovery). A superset
// of the content-script parser (public/content/classifier.js), which is a
// classic script and can't be imported here; library URLs are user-entered
// so this also accepts youtu.be short links.
const VIDEO_ID_RE = /(?:[?&]v=|\/shorts\/|youtu\.be\/)([\w-]{11})/;

export function extractVideoId(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(VIDEO_ID_RE);
  return match ? match[1] : null;
}

export function watchUrlFor(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
