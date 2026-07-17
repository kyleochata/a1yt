import { useCallback, useEffect, useState } from 'react';
import {
  addVideo,
  clearDismissals,
  dismissSuggestion,
  getAllClassifications,
  getAllDismissals,
  getAllVideos,
} from '../db/database.js';
import { buildInbox } from '../discovery/inbox.js';
import { watchUrlFor } from '../utils/youtube.js';

/**
 * Owns the quality-inbox suggestion list. Re-queries IndexedDB after every
 * mutation, mirroring useLibrary's refresh pattern.
 */
export function useDiscovery() {
  const [suggestions, setSuggestions] = useState([]);
  const [hasClassifications, setHasClassifications] = useState(false);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [classifications, videos, dismissals] = await Promise.all([
        getAllClassifications(),
        getAllVideos(),
        getAllDismissals(),
      ]);
      setSuggestions(buildInbox(classifications, videos, dismissals));
      setHasClassifications(classifications.length > 0);
      setDismissedCount(dismissals.length);
      setError(null);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addToLibrary = useCallback(async (suggestion) => {
    await addVideo({
      url: watchUrlFor(suggestion.videoId),
      title: suggestion.title,
      channel: suggestion.channel,
      tags: [],
      notes: '',
      durationSeconds: suggestion.durationSeconds,
    });
    await refresh();
  }, [refresh]);

  const dismiss = useCallback(async (videoId) => {
    await dismissSuggestion(videoId);
    await refresh();
  }, [refresh]);

  const restoreAll = useCallback(async () => {
    await clearDismissals();
    await refresh();
  }, [refresh]);

  return {
    suggestions,
    hasClassifications,
    dismissedCount,
    loading,
    error,
    addToLibrary,
    dismiss,
    restoreAll,
    refresh,
  };
}
