import { useState } from 'react';

/** Reusable add/remove string-list editor (trusted channels, blacklist keywords). */
export default function ListEditor({ label, hint, items, placeholder, onChange }) {
  const [draft, setDraft] = useState('');

  const addItem = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || items.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...items, value]);
    setDraft('');
  };

  const removeItem = (value) => onChange(items.filter((item) => item !== value));

  return (
    <div className="settings-block">
      <h3>{label}</h3>
      {hint && <p className="hint">{hint}</p>}
      <form className="list-editor-form" onSubmit={addItem}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
        />
        <button type="submit" className="btn btn-ghost">Add</button>
      </form>
      {items.length === 0 ? (
        <p className="empty-hint">Nothing added yet.</p>
      ) : (
        <ul className="item-list">
          {items.map((item) => (
            <li key={item}>
              <span>{item}</span>
              <button
                className="remove-btn"
                onClick={() => removeItem(item)}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
