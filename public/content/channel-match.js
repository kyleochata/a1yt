// Channel-entry normalization and matching for the allowlist / trusted channels.
// User entries may be display names ("Veritasium"), handles ("@veritasium"), or
// URLs ("https://www.youtube.com/@veritasium/"); extracted channelPath hrefs look
// like "/@veritasium" or "/channel/UCxyz". Normalizing all of them at compare time
// lets any of those forms match, with no migration of stored data.
//
// Keep in sync with the duplicated copy in public/background.js.
(function (root) {
  function normalizeChannel(raw) {
    let value = (raw ?? '').trim().toLowerCase();
    value = value.replace(/^https?:\/\//, '');
    value = value.replace(/^www\./, '');
    value = value.replace(/^youtube\.com/, '');
    value = value.replace(/^\/+|\/+$/g, '');
    value = value.replace(/^@/, '');
    return value;
  }

  // True when a stored entry refers to this video's channel, matching either the
  // display name or the handle/channel path.
  function channelMatches(entry, channelName, channelPath) {
    const normalized = normalizeChannel(entry);
    if (!normalized) return false;
    return (
      normalized === normalizeChannel(channelName) ||
      normalized === normalizeChannel(channelPath)
    );
  }

  root.YTC_CHANNEL_MATCH = { normalizeChannel, channelMatches };
})(typeof self !== 'undefined' ? self : globalThis);
