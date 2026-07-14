const NAV_ITEMS = [
  { id: 'library', label: 'Library', icon: '▦' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ activeView, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">YT</span>
        <span className="sidebar-title">Curator</span>
      </div>
      <nav>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">Phase 1 · local only</div>
    </aside>
  );
}
