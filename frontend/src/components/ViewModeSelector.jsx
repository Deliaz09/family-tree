import { VIEW_MODES } from '../utils/treeViewModes';
import './ViewModeSelector.css';

export default function ViewModeSelector({
  viewMode, onChange, focusName, hasFocus,
}) {
  return (
    <div className="viewmode-bar">
      <div className="viewmode-buttons">
        {VIEW_MODES.map(mode => {
          const activ = viewMode === mode.id;

          const necesitaFocus = mode.id !== 'all';
          const dezactivat = necesitaFocus && !hasFocus;
          return (
            <button
              key={mode.id}
              className={`viewmode-btn ${activ ? 'viewmode-btn-active' : ''}`}
              onClick={() => onChange(mode.id)}
              disabled={dezactivat}
              title={
                dezactivat
                  ? 'Selectează mai întâi o persoană (click pe un nod)'
                  : mode.description
              }
            >
              <span className="viewmode-icon">{mode.icon}</span>
              <span className="viewmode-label">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {viewMode !== 'all' && hasFocus && focusName && (
        <div className="viewmode-focus-info">
          Centrat pe <strong>{focusName}</strong>
        </div>
      )}
    </div>
  );
}
