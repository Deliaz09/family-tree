import { useState, useRef, useEffect } from 'react';

const ETICHETA_ROL = {
  owner:  'Proprietar',
  editor: 'Editor',
  viewer: 'Vizualizare',
};

export default function TreeSwitcher({ trees, currentTreeId, onSwitch }) {
  const [deschis, setDeschis] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function clickAfara(e) {
      if (ref.current && !ref.current.contains(e.target)) setDeschis(false);
    }
    document.addEventListener('mousedown', clickAfara);
    return () => document.removeEventListener('mousedown', clickAfara);
  }, []);

  if (!trees || trees.length <= 1) return null;

  const curent = trees.find(t => t.tree_id === currentTreeId) || trees[0];
  const eticheta = curent.is_owner
    ? 'Arborele meu'
    : `${curent.owner_name || 'Arbore partajat'}`;

  return (
    <div className="tree-switcher" ref={ref}>
      <button
        className="header-btn header-btn-outline tree-switcher-btn"
        onClick={() => setDeschis(d => !d)}
        title="Comută între arborii la care ai acces"
      >
        🌲 {eticheta} ▾
      </button>

      {deschis && (
        <div className="tree-switcher-menu">
          {trees.map(t => (
            <button
              key={t.tree_id}
              className={`tree-switcher-item ${t.tree_id === currentTreeId ? 'active' : ''}`}
              onClick={() => { setDeschis(false); onSwitch(t); }}
            >
              <span className="tsi-name">
                {t.is_owner ? '🌳 Arborele meu' : `🌲 ${t.owner_name || 'Arbore partajat'}`}
              </span>
              <span className={`tsi-role role-${t.role}`}>{ETICHETA_ROL[t.role] || t.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
