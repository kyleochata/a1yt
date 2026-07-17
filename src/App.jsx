import { useState } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import LibraryManager from './components/library/LibraryManager.jsx';
import FilterPanel from './components/filter/FilterPanel.jsx';
import SettingsPanel from './components/settings/SettingsPanel.jsx';

// Future modules (Discovery, Analytics) register a view here and a nav
// entry in Sidebar — no other wiring needed.
const VIEWS = {
  library: LibraryManager,
  filter: FilterPanel,
  settings: SettingsPanel,
};

export default function App() {
  const [activeView, setActiveView] = useState('library');
  const View = VIEWS[activeView];

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="main-content">
        <View />
      </main>
    </div>
  );
}
