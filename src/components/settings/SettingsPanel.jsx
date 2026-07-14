import { useRef, useState } from 'react';
import { usePreferences } from '../../hooks/usePreferences.js';
import {
  clearAllData,
  exportPreferencesJSON,
  importPreferencesJSON,
} from '../../storage/preferences.js';
import { downloadJSON } from '../../utils/download.js';
import ListEditor from './ListEditor.jsx';

export default function SettingsPanel() {
  const { prefs, update, reload } = usePreferences();
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null);

  const flash = (message) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 3000);
  };

  const updateSlop = (changes) => update({ slop: { ...prefs.slop, ...changes } });

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    try {
      importPreferencesJSON(await file.text());
      reload();
      flash('Preferences imported.');
    } catch (err) {
      flash(`Import failed: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Delete ALL data? This removes every saved video and resets preferences. This cannot be undone.'
    );
    if (!confirmed) return;
    await clearAllData();
    reload();
    flash('All data cleared.');
  };

  return (
    <section>
      <header className="view-header">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Stored locally in your browser — nothing leaves this device.</p>
        </div>
      </header>

      {status && <p className="status-banner">{status}</p>}

      <ListEditor
        label="Trusted creators"
        hint="Videos from these channels will always pass the filter."
        items={prefs.trustedChannels}
        placeholder="Channel name"
        onChange={(trustedChannels) => update({ trustedChannels })}
      />

      <ListEditor
        label="Blacklist keywords"
        hint="Videos whose titles contain these words will be hidden."
        items={prefs.blacklistKeywords}
        placeholder="e.g. reaction"
        onChange={(blacklistKeywords) => update({ blacklistKeywords })}
      />

      <div className="settings-block">
        <h3>Content filtering</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={prefs.filteringEnabled}
            onChange={(event) => update({ filteringEnabled: event.target.checked })}
          />
          Dim low-quality videos while browsing YouTube
        </label>
        <p className="hint">
          Sensitivity: how confident the model must be before a video is dimmed.
          0 = only blacklisted keywords, 100 = dim anything judged slop.
        </p>
        <div className="slider-row">
          <input
            type="range"
            min="0"
            max="100"
            value={prefs.sensitivity}
            onChange={(event) => update({ sensitivity: Number(event.target.value) })}
          />
          <span className="slider-value">{prefs.sensitivity}</span>
        </div>
      </div>

      <div className="settings-block">
        <h3>Slop score filter</h3>
        <p className="hint">
          Titles (and channel behavior) are scored against known slop signals. Videos scoring at
          or above the hide threshold collapse to a placeholder; the dim threshold marks the
          &ldquo;dim but don&rsquo;t remove&rdquo; band below it.
        </p>
        <div className="number-grid">
          {[
            ['Hide threshold', 'hideThreshold'],
            ['Dim threshold', 'dimThreshold'],
          ].map(([label, key]) => (
            <label key={key} className="number-field">
              <span>{label}</span>
              <input
                type="number"
                min="1"
                value={prefs.slop[key]}
                onChange={(event) => updateSlop({ [key]: Number(event.target.value) || 1 })}
              />
            </label>
          ))}
        </div>
        <p className="hint">Per-tier weights (higher = that signal counts for more):</p>
        <div className="number-grid">
          {[
            ['Tier 1 phrases', 'tier1', 1],
            ['Tier 2 patterns', 'tier2', 1],
            ['Structural (caps/emoji)', 'structural', 1],
            ['Topic clusters ×', 'topicMultiplier', 0.5],
            ['Channel heuristics ×', 'channelMultiplier', 0.5],
          ].map(([label, key, step]) => (
            <label key={key} className="number-field">
              <span>{label}</span>
              <input
                type="number"
                min="0"
                step={step}
                value={prefs.slop.weights[key]}
                onChange={(event) =>
                  updateSlop({
                    weights: { ...prefs.slop.weights, [key]: Math.max(0, Number(event.target.value) || 0) },
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={prefs.slop.debug}
            onChange={(event) => updateSlop({ debug: event.target.checked })}
          />
          Debug mode — log matched signals per video to the YouTube tab&rsquo;s console
        </label>
      </div>

      <div className="settings-block">
        <h3>Preferences backup</h3>
        <div className="view-actions">
          <button
            className="btn btn-ghost"
            onClick={() => downloadJSON(exportPreferencesJSON(), 'yt-curator-preferences.json')}
          >
            Export preferences
          </button>
          <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
            Import preferences
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className="settings-block danger-zone">
        <h3>Danger zone</h3>
        <p className="hint">Removes the entire video library and all preferences.</p>
        <button className="btn btn-danger" onClick={handleClearAll}>
          Clear all data
        </button>
      </div>
    </section>
  );
}
