import { useEffect, useState } from 'react';

const EMPTY = { url: '', title: '', channel: '', tags: '', notes: '' };

/** Add/edit form. Pass `initial` (a video record) to edit; omit to add. */
export default function VideoForm({ initial, onSubmit, onCancel }) {
  const [fields, setFields] = useState(EMPTY);

  useEffect(() => {
    if (initial) {
      setFields({
        url: initial.url,
        title: initial.title,
        channel: initial.channel,
        tags: (initial.tags ?? []).join(', '),
        notes: initial.notes ?? '',
      });
    } else {
      setFields(EMPTY);
    }
  }, [initial]);

  const set = (field) => (event) =>
    setFields((f) => ({ ...f, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const tags = fields.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    onSubmit({
      ...(initial ?? {}),
      url: fields.url.trim(),
      title: fields.title.trim(),
      channel: fields.channel.trim(),
      tags: [...new Set(tags)],
      notes: fields.notes.trim(),
    });
  };

  return (
    <form className="video-form" onSubmit={handleSubmit}>
      <h3>{initial ? 'Edit video' : 'Add video'}</h3>
      <div className="form-grid">
        <label>
          Title
          <input value={fields.title} onChange={set('title')} required />
        </label>
        <label>
          Channel
          <input value={fields.channel} onChange={set('channel')} required />
        </label>
        <label className="form-span">
          URL
          <input
            type="url"
            value={fields.url}
            onChange={set('url')}
            placeholder="https://www.youtube.com/watch?v=…"
            required
          />
        </label>
        <label className="form-span">
          Tags <span className="hint">(comma-separated)</span>
          <input value={fields.tags} onChange={set('tags')} placeholder="javascript, talks" />
        </label>
        <label className="form-span">
          Notes
          <textarea value={fields.notes} onChange={set('notes')} rows={2} />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {initial ? 'Save changes' : 'Add to library'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
