export default function SearchBar({ criteria, onChange }) {
  const set = (field) => (event) =>
    onChange({ ...criteria, [field]: event.target.value });

  return (
    <div className="search-bar">
      <input
        type="search"
        className="search-input"
        placeholder="Search title, channel, or tag…"
        value={criteria.query}
        onChange={set('query')}
      />
      <label className="date-field">
        From
        <input type="date" value={criteria.from} onChange={set('from')} />
      </label>
      <label className="date-field">
        To
        <input type="date" value={criteria.to} onChange={set('to')} />
      </label>
      {(criteria.query || criteria.from || criteria.to) && (
        <button
          className="btn btn-ghost"
          onClick={() => onChange({ query: '', from: '', to: '' })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
