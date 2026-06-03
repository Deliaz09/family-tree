import { useState, useCallback, useMemo, useEffect } from 'react';
import axios from 'axios';
import TreeCanvas from '../components/TreeCanvas';
import Sidebar from '../components/Sidebar';
import PersonPanel from '../components/PersonPanel';
import ViewModeSelector from '../components/ViewModeSelector';
import TreeSwitcher from '../components/TreeSwitcher';
import { useTree } from '../hooks/useTree';
import { setActiveTree, PermissionContext } from '../treeAccess';
import { API_BASE } from '../utils/apiBase';
import { exportTreeSVG, exportTreePDF } from '../utils/treeExport';

function ModalRelatie({ nodes, onClose }) {
  const [persoana1, setPersoana1] = useState('');
  const [persoana2, setPersoana2] = useState('');
  const [rezultat,  setRezultat]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [eroare,    setEroare]    = useState('');

  const cauta = async () => {
    if (!persoana1 || !persoana2) { setEroare('Selectează ambele persoane.'); return; }
    if (persoana1 === persoana2)  { setEroare('Selectează două persoane diferite.'); return; }
    setLoading(true); setEroare(''); setRezultat(null);
    try {
      const res = await axios.get(`${API_BASE}/api/relationship`, {
        params: { from: persoana1, to: persoana2 },
      });
      setRezultat(res.data);
    } catch (e) {
      setEroare(e.response?.data?.detail || 'Eroare la căutare.');
    } finally {
      setLoading(false);
    }
  };

  const p1 = nodes.find(n => String(n.id) === persoana1);
  const p2 = nodes.find(n => String(n.id) === persoana2);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🔗 Relație între persoane</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="relatie-selectori">
            <div className="relatie-selector">
              <label>Prima persoană</label>
              <select value={persoana1} onChange={e => setPersoana1(e.target.value)}>
                <option value="">— Selectează —</option>
                {nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.full_name}</option>
                ))}
              </select>
            </div>

            <div className="relatie-separator">↔</div>

            <div className="relatie-selector">
              <label>A doua persoană</label>
              <select value={persoana2} onChange={e => setPersoana2(e.target.value)}>
                <option value="">— Selectează —</option>
                {nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {eroare && <p className="relatie-eroare">⚠ {eroare}</p>}

          <button
            className="btn-primary relatie-btn"
            onClick={cauta}
            disabled={loading}
          >
            {loading ? 'Se caută...' : 'Caută relația'}
          </button>

          {rezultat && (
            <div className="relatie-rezultat">
              {!rezultat.found ? (
                <p className="relatie-none">{rezultat.label}</p>
              ) : (
                <>
                  <div className="relatie-titlu">
                    <strong>{p2?.full_name}</strong> este{' '}
                    <span className="relatie-tip">{rezultat.label}</span>{' '}
                    pentru <strong>{p1?.full_name}</strong>
                  </div>
                  {rezultat.chain && rezultat.chain.length > 1 && (
                    <div className="relatie-drum">
                      <small>
                        {rezultat.chain
                          .map((c, i) => (i === 0 ? c.full_name : `${c.step_ro} — ${c.full_name}`))
                          .join(' → ')}
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalStergeArbore({ totalPersoane, onClose, onSters }) {
  const [seSterge, setSeSterge] = useState(false);
  const [eroare,   setEroare]   = useState('');

  const stergeTot = async () => {
    setSeSterge(true); setEroare('');
    try {
      await axios.delete(`${API_BASE}/api/tree`);
      onSters();
    } catch (e) {
      setEroare(e.response?.data?.detail || 'Eroare la ștergerea arborelui.');
      setSeSterge(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🗑️ Șterge tot arborele</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p>
            Această acțiune va șterge <strong>definitiv</strong>{' '}
            {totalPersoane ? <>cele <strong>{totalPersoane}</strong> persoane</> : 'toate persoanele'}{' '}
            și toate relațiile din arborele tău. Operația este <strong>ireversibilă</strong>.
          </p>

          {eroare && <p className="relatie-eroare">⚠ {eroare}</p>}

          <div className="relatie-selectori" style={{ marginTop: '1rem' }}>
            <button className="btn-primary relatie-btn" onClick={onClose} disabled={seSterge}>
              Anulează
            </button>
            <button
              className="header-btn header-btn-danger relatie-btn"
              onClick={stergeTot}
              disabled={seSterge}
              autoFocus
            >
              {seSterge ? 'Se șterge...' : 'Da, șterge tot'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TreePage({ onNavigatePerson, onImport, onLogout, userName }) {
  const { nodes, edges, loading, error, stats, refetch } = useTree();

  const [idSelectat,       setIdSelectat]       = useState(null);
  const [baraDeschisa,     setBaraDeschisa]     = useState(false);
  const [idFocus,          setIdFocus]          = useState(null);
  const [viewMode,         setViewMode]         = useState('all');
  const [bowtieSpouse,     setBowtieSpouse]     = useState(null);
  const lineage = 'self';
  const [modalRelatie,     setModalRelatie]     = useState(false);
  const [modalAdaugare,    setModalAdaugare]    = useState(false);
  const [modalStergeTot,   setModalStergeTot]   = useState(false);

  const [evidentiere,      setEvidentiere]      = useState(null);
  const [semnalAdauga,     setSemnalAdauga]     = useState(0);

  const [arbori,         setArbori]        = useState([]);
  const [arboreCurent,   setArboreCurent]  = useState(null);
  const [rol,            setRol]           = useState('owner');

  const incarcaArbori = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/trees`);
      const lista = res.data || [];
      setArbori(lista);

      setArboreCurent(prev => {
        if (prev) return prev;
        const dorit = localStorage.getItem('lastJoinedTree');
        localStorage.removeItem('lastJoinedTree');
        const ales = (dorit && lista.find(t => t.tree_id === dorit))
          || lista.find(t => t.is_owner)
          || lista[0];
        if (ales) {
          setActiveTree(ales.tree_id);
          setRol(ales.role);

          if (!ales.is_owner) refetch();
          return ales.tree_id;
        }
        return prev;
      });
    } catch (e) {

      console.warn('Nu s-au putut încărca arborii:', e?.message);
    }
  }, [refetch]);

  useEffect(() => { incarcaArbori(); }, [incarcaArbori]);

  const selecteaza  = (persoana) => setIdSelectat(persoana.id);
  const reincarca   = useCallback(() => refetch(), [refetch]);

  const adaugaPrima = useCallback(() => {
    setBaraDeschisa(true);
    setSemnalAdauga(n => n + 1);
  }, []);

  const focuseazaPeArbore = useCallback((persoana) => {
    if (!persoana) return;
    setIdFocus(String(persoana.id));
    setIdSelectat(persoana.id);
    setViewMode('all');
    setBowtieSpouse(null);
    setBaraDeschisa(false);
  }, []);

  const comutaArbore = useCallback((tree) => {
    if (!tree || tree.tree_id === arboreCurent) return;
    setActiveTree(tree.tree_id);
    setArboreCurent(tree.tree_id);
    setRol(tree.role);
    setIdSelectat(null);
    setIdFocus(null);
    setBowtieSpouse(null);
    setEvidentiere(null);
    setViewMode('all');
    refetch();
  }, [arboreCurent, refetch]);

  const permisiuni = useMemo(() => ({ role: rol, treeId: arboreCurent }), [rol, arboreCurent]);
  const poateOwner = rol === 'owner';

  const persoanFocus = useMemo(
    () => (idFocus && nodes ? nodes.find(n => String(n.id) === String(idFocus)) : null),
    [idFocus, nodes]
  );

  const optiuniExport = useCallback(() => {
    const nrPersoane = stats?.total_persons ?? nodes?.length ?? 0;
    const data = new Date().toLocaleDateString('ro-RO');
    const centru = persoanFocus?.full_name ? ` · centrat pe ${persoanFocus.full_name}` : '';
    return {
      title: 'Arbore Genealogic',
      subtitle: `${nrPersoane} persoane · ${data}${centru}`,
    };
  }, [stats, nodes, persoanFocus]);

  const exportaSVG = useCallback(() => exportTreeSVG(optiuniExport()), [optiuniExport]);
  const exportaPDF = useCallback(() => exportTreePDF(optiuniExport()), [optiuniExport]);

  const noduriDeAfisat = nodes;
  const muchiiDeAfisat = edges;

  if (loading && (!nodes || nodes.length === 0)) {
    return <div className="page-loading"><div className="loader"></div><p>Se încarcă...</p></div>;
  }
  if (error && (!nodes || nodes.length === 0)) {
    return (
      <div className="page-error">
        <h2>Eroare</h2>
        <p>{error}</p>
        <button onClick={() => refetch()}>Reîncearcă</button>
      </div>
    );
  }

  return (
   <PermissionContext.Provider value={permisiuni}>
    <div className="tree-page">

      {loading && nodes && nodes.length > 0 && (
        <div className="tree-refetching">
          <span className="tree-refetching-dot" /> Se actualizează…
        </div>
      )}

      <header className="tree-header">
        <button className="menu-btn" onClick={() => setBaraDeschisa(!baraDeschisa)}>☰</button>
        <h1>Arbore Genealogic</h1>
        {stats && <span className="header-stats">{stats.total_persons} persoane</span>}

        <TreeSwitcher trees={arbori} currentTreeId={arboreCurent} onSwitch={comutaArbore} />

        {rol !== 'owner' && (
          <span className={`role-badge role-${rol}`}>
            {rol === 'editor' ? 'Editor' : 'Vizualizare'}
          </span>
        )}

        <div className="header-right">

          <button
            className="header-btn header-btn-outline"
            onClick={() => setModalRelatie(true)}
            title="Caută relația dintre două persoane"
          >
            🔗 Relație
          </button>

          {poateOwner && (
            <button className="header-btn header-btn-outline" onClick={onImport}>
              Import
            </button>
          )}

          {poateOwner && nodes && nodes.length > 0 && (
            <button
              className="header-btn header-btn-danger"
              onClick={() => setModalStergeTot(true)}
              title="Șterge definitiv tot arborele"
            >
              🗑️ Șterge tot
            </button>
          )}

          <span className="header-user">{userName}</span>
          <button className="header-btn header-btn-logout" onClick={onLogout}>Ieși</button>
        </div>
      </header>

      <ViewModeSelector
        viewMode={viewMode}
        onChange={setViewMode}
        focusName={persoanFocus?.full_name}
        hasFocus={!!idFocus}
      />

      {idFocus && persoanFocus && (
        <div className="focus-bar">
          <span>
            Persoană centrală: <strong>{persoanFocus.full_name}</strong>
          </span>
          <div className="focus-actions">

            {viewMode === 'ancestors' ? (
              <button className="focus-clear" onClick={() => setViewMode('all')}>
                🌳 Vezi tot arborele
              </button>
            ) : (
              <button
                className="focus-clear"
                onClick={() => setViewMode('ancestors')}
                title="Doar strămoșii direcți, separați curat: tatăl în stânga, mama în dreapta, fără duplicate."
              >
                ⬆ Vezi ascendenții
              </button>
            )}
            <button className="focus-clear" onClick={() => { setIdFocus(null); setViewMode('all'); }}>
              ✕ Renunță la focus
            </button>
          </div>
        </div>
      )}

      {evidentiere && (
        <div className="path-highlight-banner">
          <span>🔗 {evidentiere.label}</span>
          <button
            className="path-highlight-close"
            onClick={() => setEvidentiere(null)}
            title="Curăță evidențierea drumului"
          >
            ✕ Închide
          </button>
        </div>
      )}

      <div className="tree-content">
        <Sidebar
          nodes={nodes}
          stats={stats}
          selectedId={idSelectat}
          onSelectPerson={selecteaza}
          onFocusPerson={focuseazaPeArbore}
          onClose={() => setBaraDeschisa(false)}
          isOpen={baraDeschisa}
          onSaved={reincarca}
          onExportSVG={exportaSVG}
          onExportPDF={exportaPDF}
          openAddSignal={semnalAdauga}
        />

        <TreeCanvas
          nodes={noduriDeAfisat}
          edges={muchiiDeAfisat}
          selectedId={idSelectat}
          focusId={idFocus}
          viewMode={viewMode}
          lineage={lineage}
          compact={false}
          bowtieSpouseId={bowtieSpouse}
          onBowtieSpouse={setBowtieSpouse}
          onSelectPerson={selecteaza}
          onFocusChange={setIdFocus}
          highlightIds={evidentiere?.ids}
          onAddFirst={adaugaPrima}
        />

        {idSelectat && (
          <PersonPanel
            personId={idSelectat}
            persons={nodes}
            onClose={() => setIdSelectat(null)}
            onSaved={reincarca}
            onHighlightPath={setEvidentiere}
            onFocus={(id) => {

              setIdFocus(id);
              setIdSelectat(null);
              setViewMode('all');
              setBowtieSpouse(null);
            }}
          />
        )}
      </div>

      {modalRelatie && (
        <ModalRelatie
          nodes={nodes}
          onClose={() => setModalRelatie(false)}
        />
      )}

      {modalStergeTot && (
        <ModalStergeArbore
          totalPersoane={stats?.total_persons ?? nodes?.length}
          onClose={() => setModalStergeTot(false)}
          onSters={() => {
            setModalStergeTot(false);
            setIdSelectat(null);
            setIdFocus(null);
            reincarca();
          }}
        />
      )}
    </div>
   </PermissionContext.Provider>
  );
}
