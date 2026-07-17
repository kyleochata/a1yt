import { watchUrlFor } from '../../utils/youtube.js';
import { formatDuration } from '../../utils/duration.js';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function SuggestionCard({ suggestion, onAdd, onDismiss }) {
  return (
    <article className="video-card">
      <div className="video-card-header">
        <a
          href={watchUrlFor(suggestion.videoId)}
          target="_blank"
          rel="noreferrer"
          className="video-title"
        >
          {suggestion.title || 'Untitled'}
        </a>
        <div className="video-card-actions">
          <button className="btn btn-primary" onClick={() => onAdd(suggestion)}>
            Add to library
          </button>
          <button className="btn btn-ghost" onClick={() => onDismiss(suggestion.videoId)}>
            Dismiss
          </button>
        </div>
      </div>
      <div className="video-meta">
        <span className="video-channel">{suggestion.channel}</span>
        {formatDuration(suggestion.durationSeconds) && (
          <span className="video-duration">{formatDuration(suggestion.durationSeconds)}</span>
        )}
        <span className="verdict-badge verdict-quality">quality</span>
        <span>{Math.round(suggestion.confidence * 100)}%</span>
        <span className="video-date">classified {formatDate(suggestion.classifiedAt)}</span>
      </div>
      {suggestion.reason && <p className="video-notes">{suggestion.reason}</p>}
    </article>
  );
}
