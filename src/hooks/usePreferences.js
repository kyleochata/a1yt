import { useCallback, useState } from 'react';
import { loadPreferences, savePreferences } from '../storage/preferences.js';

/** Preferences state backed by localStorage; every update persists immediately. */
export function usePreferences() {
  const [prefs, setPrefs] = useState(loadPreferences);

  const update = useCallback((changes) => {
    setPrefs((current) => savePreferences({ ...current, ...changes }));
  }, []);

  const reload = useCallback(() => setPrefs(loadPreferences()), []);

  return { prefs, update, reload };
}
