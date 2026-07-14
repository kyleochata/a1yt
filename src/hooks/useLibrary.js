import { useCallback, useEffect, useState } from 'react';
import {
  addVideo,
  deleteVideo,
  searchVideos,
  updateVideo,
} from '../db/database.js';
import { seedSampleData } from '../db/seedData.js';

/**
 * Owns the video list and the active search criteria. Re-queries
 * IndexedDB whenever criteria change or a mutation happens.
 */
export function useLibrary() {
  const [videos, setVideos] = useState([]);
  const [criteria, setCriteria] = useState({ query: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const results = await searchVideos(criteria);
      results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      setVideos(results);
      setError(null);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [criteria]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(async (video) => {
    await addVideo(video);
    await refresh();
  }, [refresh]);

  const update = useCallback(async (video) => {
    await updateVideo(video);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id) => {
    await deleteVideo(id);
    await refresh();
  }, [refresh]);

  const seed = useCallback(async () => {
    await seedSampleData();
    await refresh();
  }, [refresh]);

  return { videos, criteria, setCriteria, loading, error, add, update, remove, seed, refresh };
}
