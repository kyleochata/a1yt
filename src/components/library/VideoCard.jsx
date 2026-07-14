function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function VideoCard({ video, onEdit, onDelete }) {
  return (
    <article className="video-card">
      <div className="video-card-header">
        <a href={video.url} target="_blank" rel="noreferrer" className="video-title">
          {video.title || 'Untitled'}
        </a>
        <div className="video-card-actions">
          <button className="btn btn-ghost" onClick={() => onEdit(video)}>Edit</button>
          <button className="btn btn-danger-ghost" onClick={() => onDelete(video.id)}>
            Delete
          </button>
        </div>
      </div>
      <div className="video-meta">
        <span className="video-channel">{video.channel}</span>
        <span className="video-date">saved {formatDate(video.savedAt)}</span>
      </div>
      {video.tags?.length > 0 && (
        <div className="tag-row">
          {video.tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}
      {video.notes && <p className="video-notes">{video.notes}</p>}
    </article>
  );
}
