import { useState } from 'react';
import { useLibrary } from '../../hooks/useLibrary.js';
import { exportLibraryJSON } from '../../db/database.js';
import { downloadJSON } from '../../utils/download.js';
import SearchBar from './SearchBar.jsx';
import VideoCard from './VideoCard.jsx';
import VideoForm from './VideoForm.jsx';

export default function LibraryManager() {
  const { videos, criteria, setCriteria, loading, error, add, update, remove, seed } =
    useLibrary();
  // null = form closed, 'new' = adding, otherwise the video being edited
  const [editing, setEditing] = useState(null);

  const hasFilters = criteria.query || criteria.from || criteria.to;

  const handleSubmit = async (video) => {
    if (video.id) {
      await update(video);
    } else {
      await add(video);
    }
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Remove this video from your library?')) {
      await remove(id);
    }
  };

  const handleExport = async () => {
    downloadJSON(await exportLibraryJSON(), 'yt-curator-library.json');
  };

  return (
    <section>
      <header className="view-header">
        <div>
          <h1>Library</h1>
          <p className="subtitle">
            {videos.length} video{videos.length === 1 ? '' : 's'}
            {hasFilters ? ' matching filters' : ' saved locally'}
          </p>
        </div>
        <div className="view-actions">
          <button className="btn btn-ghost" onClick={handleExport}>
            Export JSON
          </button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            + Add video
          </button>
        </div>
      </header>

      <SearchBar criteria={criteria} onChange={setCriteria} />

      {editing && (
        <VideoForm
          initial={editing === 'new' ? null : editing}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      )}

      {error && <p className="error-banner">Library error: {error}</p>}

      {!loading && videos.length === 0 && !hasFilters ? (
        <div className="empty-state">
          <p>Your library is empty.</p>
          <button className="btn btn-primary" onClick={seed}>
            Load sample videos
          </button>
        </div>
      ) : !loading && videos.length === 0 ? (
        <div className="empty-state">
          <p>No videos match your filters.</p>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
