import { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import PersonCard from './PersonCard';
import SearchBar from './SearchBar';
import AddEditPanel from './AddEditPanel';
import CollaborationPanel from './CollaborationPanel';
import { usePermissions } from '../treeAccess';
import { supabase } from '../supabaseClient';
import { slugFilename } from '../utils/slugFilename';
import { API_BASE } from '../utils/apiBase';
const PHOTOS_BUCKET = import.meta.env.VITE_SUPABASE_PHOTOS_BUCKET || 'photos';

export default function Sidebar({
  nodes, stats, selectedId, onSelectPerson, onFocusPerson,
  onClose, isOpen, onSaved, onExportSVG, onExportPDF, openAddSignal
}) {
  const { canWrite, canOwner } = usePermissions();
  const [filterGender,  setFilterGender]  = useState('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [panou,         setPanou]         = useState(null);
  const [confirmSterge, setConfirmSterge] = useState(false);
  const [stergeLoading, setStergeLoading] = useState(false);
  const [gedcomLoading, setGedcomLoading] = useState(false);
  const [fixPozeLoading, setFixPozeLoading] = useState(false);
  const [svgLoading,    setSvgLoading]    = useState(false);
  const [pdfLoading,    setPdfLoading]    = useState(false);

  const lipsesteArbore = !nodes || nodes.length === 0;

  useEffect(() => {
    if (openAddSignal && canWrite) setPanou('add');
  }, [openAddSignal, canWrite]);

  const ruleazaExport = async (fn, setBusy) => {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(e?.message || 'Exportul a eșuat.');
    } finally {
      setBusy(false);
    }
  };

  const persoanSelectata = useMemo(() =>
    nodes?.find(n => String(n.id) === String(selectedId)) || null,
    [nodes, selectedId]
  );

  const grouped = useMemo(() => {
    if (!nodes) return {};
    let filtered = [...nodes];
    if (filterGender !== 'all') {
      filtered = filtered.filter(n => n.gender === filterGender);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => (n.full_name || '').toLowerCase().includes(q));
    }
    const groups = {};
    filtered.forEach(n => {
      const gen = n.generation ?? 0;
      if (!groups[gen]) groups[gen] = [];
      groups[gen].push(n);
    });
    return groups;
  }, [nodes, filterGender, searchQuery]);

  const genKeys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));

  async function stergeTotArborele() {
    setStergeLoading(true);
    try {
      await axios.delete(`${API_BASE}/api/tree`);
      setConfirmSterge(false);
      if (onSaved) onSaved();
    } catch (e) {
      alert('Eroare la ștergerea arborelui: ' + (e.response?.data?.detail || e.message));
    } finally {
      setStergeLoading(false);
    }
  }

  async function reparaNumePoze() {
    setFixPozeLoading(true);
    try {
      let mutate = 0, esuate = 0;
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (uid) {
        const pageSize = 100;
        let offset = 0;
        for (let guard = 0; guard < 200; guard++) {
          const { data: objs, error } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .list(uid, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
          if (error || !objs || !objs.length) break;
          for (const o of objs) {
            if (!o.name || o.id === null) continue;
            const nou = slugFilename(o.name);
            if (nou === o.name) continue;
            try {
              const { error: mvErr } = await supabase.storage
                .from(PHOTOS_BUCKET)
                .move(`${uid}/${o.name}`, `${uid}/${nou}`);
              if (mvErr) esuate++; else mutate++;
            } catch { esuate++; }
          }
          if (objs.length < pageSize) break;
          offset += pageSize;
        }
      }
      const res = await axios.post(`${API_BASE}/api/persons/normalize-photo-names`);
      const { persoane_actualizate = 0 } = res.data || {};
      alert(
        (persoane_actualizate === 0 && mutate === 0)
          ? 'Nimic de reparat — numele pozelor sunt deja ASCII.'
          : `Reparat: ${persoane_actualizate} persoane actualizate în arbore, ${mutate} fișiere redenumite în storage` +
            (esuate ? `, ${esuate} nereușite (fișier lipsă sau deja redenumit).` : '.')
      );
      if (onSaved) onSaved();
    } catch (e) {
      alert('Eroare la repararea numelor de poze: ' + (e.response?.data?.detail || e.message));
    } finally {
      setFixPozeLoading(false);
    }
  }

  async function exportGedcom() {
    setGedcomLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/export/gedcom`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'arbore.ged';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Eroare la exportul GEDCOM: ' + (e.response?.data?.detail || e.message));
    } finally {
      setGedcomLoading(false);
    }
  }

  if (panou === 'add' || panou === 'edit') {
    return (
      <aside className={`sidebar sidebar-panel-mode ${isOpen ? 'open' : ''}`}>
        <AddEditPanel
          persons={nodes}
          editPerson={panou === 'edit' ? persoanSelectata : null}
          onClose={() => setPanou(null)}
          onSaved={() => { setPanou(null); if (onSaved) onSaved(); }}
        />
      </aside>
    );
  }

  if (panou === 'integrity' || panou === 'duplicates' || panou === 'quality' || panou === 'audit') {
    return (
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{panou === 'integrity' ? 'Integritatea datelor' : panou === 'duplicates' ? 'Duplicate' : panou === 'quality' ? 'Calitatea datelor' : 'Audit'}</h2>
          <button className="sidebar-close" onClick={() => setPanou(null)}>✕</button>
        </div>
        {panou === 'integrity' ? (
          <IntegrityPanel
            nodes={nodes}
            onSelectPerson={(p) => { onSelectPerson(p); }}
          />
        ) : panou === 'duplicates' ? (
          <DuplicatesPanel onMerged={() => { if (onSaved) onSaved(); }} />
        ) : panou === 'quality' ? (
          <QualityPanel />
        ) : (
          <AuditPanel />
        )}
      </aside>
    );
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>

      <div className="sidebar-header">
        <h2>🌳 Familia</h2>
        <button className="sidebar-close" onClick={onClose}>✕</button>
      </div>

      {stats && (
        <div className="sidebar-stats">
          <div className="stat-item">
            <span className="stat-number">{stats.total_persons}</span>
            <span className="stat-label">Persoane</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{stats.max_generation ?? 0}</span>
            <span className="stat-label">Generații</span>
          </div>
        </div>
      )}

      <div className="sidebar-actions">

        {canWrite && (
          <>
            <p className="sidebar-group-label">Persoane</p>

            <button
              className="sidebar-action-btn sidebar-action-add"
              onClick={() => setPanou('add')}
              title="Adaugă o persoană nouă în arbore"
            >
              <span className="action-icon">➕</span>
              <span>Adaugă persoană</span>
            </button>

            <button
              className={`sidebar-action-btn sidebar-action-edit ${!selectedId ? 'disabled' : ''}`}
              onClick={() => selectedId && setPanou('edit')}
              title={selectedId ? 'Editează persoana selectată' : 'Selectează o persoană din arbore mai întâi'}
              disabled={!selectedId}
            >
              <span className="action-icon">✏️</span>
              <span>{persoanSelectata ? `Editează: ${persoanSelectata.full_name?.split(' ')[0]}` : 'Editează persoana'}</span>
            </button>
          </>
        )}

        {!canWrite && (
          <p className="sidebar-readonly-note">👁️ Ai acces de vizualizare la acest arbore.</p>
        )}

        <p className="sidebar-group-label">Partajare &amp; export</p>

        <button
          className="sidebar-action-btn sidebar-action-export"
          onClick={() => ruleazaExport(onExportSVG, setSvgLoading)}
          disabled={svgLoading || lipsesteArbore}
          title="Exportă arborele ca fișier SVG interactiv, de sine stătător (poze incluse, zoom/pan)"
        >
          <span className="action-icon">↓</span>
          <span>{svgLoading ? 'Se exportă…' : 'Export SVG'}</span>
        </button>

        <button
          className="sidebar-action-btn sidebar-action-export"
          onClick={() => ruleazaExport(onExportPDF, setPdfLoading)}
          disabled={pdfLoading || lipsesteArbore}
          title="Exportă arborele ca fișier PDF (o pagină, pregătit pentru tipărire)"
        >
          <span className="action-icon">📄</span>
          <span>{pdfLoading ? 'Se exportă…' : 'Export PDF'}</span>
        </button>

        <button
          className="sidebar-action-btn sidebar-action-export"
          onClick={exportGedcom}
          disabled={gedcomLoading || !nodes || nodes.length === 0}
          title="Exportă arborele ca fișier GEDCOM 5.5.1 (arbore.ged), importabil în orice aplicație genealogică"
        >
          <span className="action-icon">⬇</span>
          <span>{gedcomLoading ? 'Se exportă…' : 'Export GEDCOM'}</span>
        </button>

        {canOwner && <CollaborationPanel />}

        {canOwner && (
          <>
            <p className="sidebar-group-label">Integritatea datelor</p>
            <button
              className="sidebar-action-btn"
              onClick={() => setPanou('quality')}
              title="Vezi scorul de completitudine si zonele cu date lipsa"
            >
              <span className="action-icon">%</span>
              <span>Calitatea datelor</span>
            </button>
            <button
              className="sidebar-action-btn"
              onClick={() => setPanou('integrity')}
              title="Scanează arborele după probleme logice (ani, cicluri de filiație, vârste improbabile)"
            >
              <span className="action-icon">🩺</span>
              <span>Verifică integritatea</span>
            </button>
            <button
              className="sidebar-action-btn"
              onClick={() => setPanou('duplicates')}
              title="Caută persoane care par înregistrate de două ori și unește-le"
            >
              <span className="action-icon">👥</span>
              <span>Verifică duplicate</span>
            </button>
            <button
              className="sidebar-action-btn"
              onClick={() => setPanou('audit')}
              title="Vezi ultimele modificari facute in arbore"
            >
              <span className="action-icon">#</span>
              <span>Audit modificari</span>
            </button>
            {}
          </>
        )}

        {canOwner && (
        <>
        <p className="sidebar-group-label sidebar-group-danger">Zonă periculoasă</p>
        {!confirmSterge ? (
          <button
            className="sidebar-action-btn sidebar-action-danger"
            onClick={() => setConfirmSterge(true)}
            disabled={!nodes || nodes.length === 0}
            title={nodes && nodes.length ? 'Șterge toate persoanele și relațiile' : 'Arborele este deja gol'}
          >
            <span className="action-icon">🗑️</span>
            <span>Șterge tot arborele</span>
          </button>
        ) : (
          <div className="sidebar-danger-confirm">
            <p>Ștergi <strong>tot arborele</strong> ({nodes?.length || 0} persoane)? Acțiunea este ireversibilă.</p>
            <div className="sidebar-danger-buttons">
              <button
                className="sidebar-danger-yes"
                onClick={stergeTotArborele}
                disabled={stergeLoading}
              >
                {stergeLoading ? 'Se șterge...' : 'Da, șterge tot'}
              </button>
              <button
                className="sidebar-danger-no"
                onClick={() => setConfirmSterge(false)}
                disabled={stergeLoading}
              >
                Anulează
              </button>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <div className="sidebar-divider" />

      <SearchBar
        persons={nodes}
        onSelect={(p) => { (onFocusPerson || onSelectPerson)?.(p); onClose?.(); }}
        onSearch={setSearchQuery}
      />

      <div className="sidebar-filters">
        <button
          className={`filter-btn ${filterGender === 'all' ? 'active' : ''}`}
          onClick={() => setFilterGender('all')}
        >Toți</button>
        <button
          className={`filter-btn ${filterGender === 'M' ? 'active' : ''}`}
          onClick={() => setFilterGender('M')}
        >♂ Bărbați</button>
        <button
          className={`filter-btn ${filterGender === 'F' ? 'active' : ''}`}
          onClick={() => setFilterGender('F')}
        >♀ Femei</button>
      </div>

      <div className="sidebar-list">
        {genKeys.length === 0 && (
          <p className="sidebar-empty">Nicio persoană găsită.</p>
        )}
        {genKeys.map(gen => (
          <div key={gen} className="gen-group">
            <h3 className="gen-title">Generația {gen}</h3>
            <div className="gen-persons">
              {grouped[gen].map(p => (
                <PersonCard
                  key={p.id}
                  person={p}
                  compact
                  selected={String(p.id) === String(selectedId)}
                  onClick={onSelectPerson}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function QualityPanel() {
  const [date, setDate] = useState(null);
  const [eroare, setEroare] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/api/data-quality`)
      .then(res => setDate(res.data))
      .catch(e => setEroare(e.response?.data?.detail || e.message));
  }, []);

  if (eroare) return <p className="pp-error" style={{ padding: '0 16px' }}>⚠ {eroare}</p>;
  if (!date) return <div className="loader" style={{ margin: '24px auto' }} />;

  const items = [
    ['Persoane', date.total_persons],
    ['Fara an nastere', date.missing_birth],
    ['Fara gen', date.missing_gender],
    ['Fara poza', date.missing_photo],
    ['Fara parinti', date.without_parents],
    ['Persoane izolate', date.isolated_persons],
    ['Relatii incomplete', date.incomplete_relations],
    ['Cereri pending', date.pending_changes],
    ['Intrari audit', date.audit_entries],
  ];

  return (
    <div className="sidebar-list">
      <div className="quality-score">
        <strong>{date.score}%</strong>
        <span>completitudine date</span>
      </div>
      {items.map(([label, value]) => (
        <div key={label} className="quality-row">
          <span>{label}</span>
          <strong>{value ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function AuditPanel() {
  const [items, setItems] = useState(null);
  const [eroare, setEroare] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/api/audit`, { params: { limit: 80 } })
      .then(res => setItems(res.data.items || []))
      .catch(e => setEroare(e.response?.data?.detail || e.message));
  }, []);

  if (eroare) return <p className="pp-error" style={{ padding: '0 16px' }}>⚠ {eroare}</p>;
  if (items === null) return <div className="loader" style={{ margin: '24px auto' }} />;

  return (
    <div className="sidebar-list">
      {items.length === 0 ? (
        <p className="sidebar-empty">Nu exista modificari inregistrate.</p>
      ) : (
        items.map(a => (
          <div key={a.id} className="audit-item">
            <strong>{a.action}</strong>
            <span>{a.entity_type}{a.entity_id ? ` · ${a.entity_id}` : ''}</span>
            <small>{a.actor_name || a.actor_email || 'utilizator'} · {a.created_at}</small>
          </div>
        ))
      )}
    </div>
  );
}

function IntegrityPanel({ nodes, onSelectPerson }) {
  const [probleme, setProbleme] = useState(null);
  const [eroare, setEroare] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/api/integrity`)
      .then(res => setProbleme(res.data.probleme || []))
      .catch(e => setEroare(e.response?.data?.detail || e.message));
  }, []);

  function selecteazaPersoana(pid) {
    const p = nodes?.find(n => String(n.id) === String(pid));
    if (onSelectPerson) onSelectPerson(p || { id: pid });
  }

  if (eroare) return <p className="pp-error" style={{ padding: '0 16px' }}>⚠ {eroare}</p>;
  if (probleme === null) return <div className="loader" style={{ margin: '24px auto' }} />;

  return (
    <div className="sidebar-list">
      {probleme.length === 0 ? (
        <p className="sidebar-empty">✅ Nicio problemă găsită — datele arborelui sunt consistente.</p>
      ) : (
        <>
          <p className="sidebar-group-label">{probleme.length} probleme găsite</p>
          {probleme.map((pr, i) => (
            <button
              key={i}
              className="integrity-item"
              onClick={() => pr.person_ids?.length && selecteazaPersoana(pr.person_ids[0])}
              title="Selectează persoana în arbore"
            >
              <span className="integrity-icon">{pr.severitate === 'eroare' ? '⛔' : '⚠️'}</span>
              <span className="integrity-msg">{pr.mesaj_ro}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function DuplicatesPanel({ onMerged }) {
  const [pairs, setPairs] = useState(null);
  const [eroare, setEroare] = useState('');
  const [merging, setMerging] = useState(false);

  const incarca = () => {
    setPairs(null); setEroare('');
    axios.get(`${API_BASE}/api/duplicates`)
      .then(res => setPairs(res.data.pairs || []))
      .catch(e => setEroare(e.response?.data?.detail || e.message));
  };
  useEffect(incarca, []);

  async function uneste(keep, remove) {
    const ok = window.confirm(
      `Unești duplicatele?\n\nSe păstrează: ${keep.full_name}${keep.birth ? ` (${keep.birth})` : ''}\n` +
      `Se elimină: ${remove.full_name}${remove.birth ? ` (${remove.birth})` : ''}\n\n` +
      `Toate relațiile (părinți, partener, copii) se mută pe persoana păstrată.`
    );
    if (!ok) return;
    setMerging(true);
    try {
      await axios.post(`${API_BASE}/api/persons/merge`, {
        keep_id: keep.id, remove_id: remove.id,
      });
      incarca();
      if (onMerged) onMerged();
    } catch (e) {
      alert('Eroare la unire: ' + (e.response?.data?.detail || e.message));
    } finally {
      setMerging(false);
    }
  }

  const MiniCard = ({ p }) => (
    <div className="dup-card">
      {p.photo_url && p.photo_url.startsWith('http')
        ? <img src={p.photo_url} alt={p.full_name} className="dup-photo" />
        : <div className="dup-avatar">{(p.full_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2)}</div>}
      <div className="dup-info">
        <strong>{p.full_name}</strong>
        <small>{p.birth ? p.birth : 'an necunoscut'}{p.death ? ` – ${p.death}` : ''}</small>
      </div>
    </div>
  );

  if (eroare) return <p className="pp-error" style={{ padding: '0 16px' }}>⚠ {eroare}</p>;
  if (pairs === null) return <div className="loader" style={{ margin: '24px auto' }} />;

  return (
    <div className="sidebar-list">
      {pairs.length === 0 ? (
        <p className="sidebar-empty">✅ Nicio pereche de duplicate găsită.</p>
      ) : (
        <>
          <p className="sidebar-group-label">{pairs.length} perechi candidate</p>
          {pairs.map(({ a, b, score, motive }, i) => (
            <div key={i} className="dup-pair">
              <div className="dup-score">
                <strong>{score}%</strong>
                <span>{(motive || []).join(' · ')}</span>
              </div>
              <MiniCard p={a} />
              <MiniCard p={b} />
              <div className="dup-actions">
                <button disabled={merging} onClick={() => uneste(a, b)}
                        title={`Păstrează ${a.full_name} și elimină duplicatul`}>
                  Unește → păstrează prima
                </button>
                <button disabled={merging} onClick={() => uneste(b, a)}
                        title={`Păstrează ${b.full_name} și elimină duplicatul`}>
                  Unește → păstrează a doua
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
