import { useDiscovery } from '../../hooks/useDiscovery.js';
import SuggestionCard from './SuggestionCard.jsx';

export default function DiscoveryPanel() {
  const {
    suggestions,
    hasClassifications,
    dismissedCount,
    loading,
    error,
    addToLibrary,
    dismiss,
    restoreAll,
    refresh,
  } = useDiscovery();

  const handleRestoreAll = async () => {
    if (window.confirm(`Restore ${dismissedCount} dismissed suggestion${dismissedCount === 1 ? '' : 's'}?`)) {
      await restoreAll();
    }
  };

  return (
    <section>
      <header className="view-header">
        <div>
          <h1>Discovery</h1>
          <p className="subtitle">
            {suggestions.length} quality video{suggestions.length === 1 ? '' : 's'} spotted while browsing
          </p>
        </div>
        <div className="view-actions">
          <button className="btn btn-ghost" onClick={refresh}>Refresh</button>
        </div>
      </header>

      {error && <p className="error-banner">Discovery error: {error}</p>}

      {!loading && !hasClassifications ? (
        <div className="empty-state">
          <p>
            No videos classified yet. Browse YouTube with the extension enabled
            and quality finds will appear here.
          </p>
        </div>
      ) : !loading && suggestions.length === 0 ? (
        <div className="empty-state">
          <p>All caught up — everything quality is saved or dismissed.</p>
        </div>
      ) : (
        <div className="video-grid">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.videoId}
              suggestion={suggestion}
              onAdd={addToLibrary}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}

      {dismissedCount > 0 && (
        <p className="hint">
          {dismissedCount} dismissed ·{' '}
          <button className="btn btn-ghost" onClick={handleRestoreAll}>
            Restore all
          </button>
        </p>
      )}
    </section>
  );
}
