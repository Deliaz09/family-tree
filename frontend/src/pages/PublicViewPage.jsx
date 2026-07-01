import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import TreeCanvas from '../components/TreeCanvas';
import { API_BASE } from '../utils/apiBase';

function tokenDinUrl() {
  const m = window.location.pathname.match(/\/view\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function PublicViewPage() {
  const token = useMemo(tokenDinUrl, []);
  const [nodes, setNodes]   = useState([]);
  const [edges, setEdges]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!token) { setError('Link invalid.'); setLoading(false); return; }
    let activ = true;

    axios.create()
      .get(`${API_BASE}/api/share/view/${token}`, { params: { _: Date.now() } })
      .then(res => {
        if (!activ) return;
        setNodes(res.data.nodes || []);
        setEdges(res.data.edges || []);
        setLoading(false);
      })
      .catch(err => {
        if (!activ) return;
        const code = err.response?.status;
        setError(
          code === 404
            ? 'Linkul nu este valid sau a fost dezactivat.'
            : (err.response?.data?.detail || 'Nu s-a putut încărca arborele partajat.')
        );
        setLoading(false);
      });
    return () => { activ = false; };
  }, [token]);

  const selectedPerson = useMemo(
    () => nodes.find(n => String(n.id) === String(selectedId)) || null,
    [nodes, selectedId]
  );

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Se încarcă arborele partajat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-error">
        <h2>Arbore indisponibil</h2>
        <p>{error}</p>
        <a className="btn-primary" href="/">Mergi la pagina principală</a>
      </div>
    );
  }

  return (
    <div className="tree-page">
      <header className="tree-header">
        <h1>🌳 Arbore Genealogic</h1>
        <span className="header-stats">{nodes.length} persoane</span>
        <div className="header-right">
          <span className="header-user">Vizualizare publică (read-only)</span>
          <a className="header-btn header-btn-outline" href="/">Autentificare</a>
        </div>
      </header>

      <div className="tree-content">
        <TreeCanvas
          nodes={nodes}
          edges={edges}
          selectedId={selectedId}
          viewMode="all"
          onSelectPerson={(p) => setSelectedId(p.id)}
        />

        {selectedPerson && (
          <div className="person-panel">
            <div className="pp-header">
              <h2>{selectedPerson.full_name}</h2>
              <button className="pp-close" onClick={() => setSelectedId(null)}>✕</button>
            </div>
            <div className="pp-info">
              {selectedPerson.surname && <p>Numele la naștere: <strong>{selectedPerson.surname}</strong></p>}
              <p>Gen: <strong>{selectedPerson.gender === 'M' ? 'Masculin' : selectedPerson.gender === 'F' ? 'Feminin' : '—'}</strong></p>
              {selectedPerson.birth && <p>Anul nașterii: <strong>{selectedPerson.birth}</strong></p>}
              {selectedPerson.death && <p>Anul decesului: <strong>{selectedPerson.death}</strong></p>}
              {selectedPerson.address && <p>📍 {selectedPerson.address}</p>}
              {selectedPerson.note && <p>📝 {selectedPerson.note}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
