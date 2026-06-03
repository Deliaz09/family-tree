import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../utils/apiBase';

const ETICHETA_ROL = {
  editor: 'Editor',
  viewer: 'Vizualizare',
};

function LinkBox({ icon, titlu, descriere, url, onGenereaza, onRevoca, genText }) {
  const [copiat, setCopiat] = useState(false);
  const [genereaza, setGenereaza] = useState(false);

  async function handleGen() {
    setGenereaza(true);
    try { await onGenereaza(); } finally { setGenereaza(false); }
  }
  function copiaza() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiat(true);
      setTimeout(() => setCopiat(false), 2500);
    });
  }

  if (!url) {
    return (
      <button
        className="sidebar-action-btn sidebar-action-share"
        onClick={handleGen}
        disabled={genereaza}
        title={descriere}
      >
        <span className="action-icon">{icon}</span>
        <span>{genereaza ? 'Se generează...' : genText}</span>
      </button>
    );
  }

  return (
    <div className="sidebar-share-box">
      <div className="share-label">{icon} {titlu}</div>
      <div className="share-url">{url.slice(0, 38)}...</div>
      <div className="share-buttons">
        <button className="share-copy-btn" onClick={copiaza}>
          {copiat ? '✅ Copiat!' : '📋 Copiază'}
        </button>
        <button className="share-revoke-btn" onClick={onRevoca} title="Dezactivează linkul">
          ✕
        </button>
      </div>
      <p className="share-note">{descriere}</p>
    </div>
  );
}

export default function CollaborationPanel() {
  const [linkView,  setLinkView]  = useState(null);
  const [linkEdit,  setLinkEdit]  = useState(null);
  const [membri,    setMembri]    = useState([]);
  const [cereri,    setCereri]    = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('editor');
  const [inviteMsg,   setInviteMsg]   = useState(null);
  const [inviteBusy,  setInviteBusy]  = useState(false);

  const incarca = useCallback(async () => {
    try {
      const [v, e, m, c] = await Promise.all([
        axios.get(`${API_BASE}/api/share`),
        axios.get(`${API_BASE}/api/collab/link`),
        axios.get(`${API_BASE}/api/members`),
        axios.get(`${API_BASE}/api/change-requests`),
      ]);
      setLinkView(v.data?.url || null);
      setLinkEdit(e.data?.url || null);
      setMembri(m.data || []);
      setCereri(c.data?.items || []);
    } catch (e) {

    }
  }, []);

  useEffect(() => { incarca(); }, [incarca]);

  async function genView() {
    const res = await axios.post(`${API_BASE}/api/share/generate`);
    setLinkView(`${window.location.origin}/view/${res.data.token}`);
  }
  async function revocaView() {
    try { await axios.delete(`${API_BASE}/api/share/revoke`); setLinkView(null); }
    catch (e) { alert('Eroare la dezactivarea linkului de vizualizare.'); }
  }

  async function genEdit() {
    const res = await axios.post(`${API_BASE}/api/collab/link`);
    setLinkEdit(`${window.location.origin}/join/${res.data.token}`);
  }
  async function revocaEdit() {
    try { await axios.delete(`${API_BASE}/api/collab/link`); setLinkEdit(null); }
    catch (e) { alert('Eroare la dezactivarea linkului de editare.'); }
  }

  async function invitaMembru(e) {
    e.preventDefault();
    const em = inviteEmail.trim().toLowerCase();
    if (!em || !em.includes('@')) {
      setInviteMsg({ ok: false, text: 'Introdu o adresă de email validă.' });
      return;
    }
    setInviteBusy(true);
    setInviteMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/api/members/invite`, { email: em, role: inviteRole });
      const trimis = res.data?.email_trimis;
      setInviteMsg({
        ok: true,
        text: trimis === false
          ? `${em} a fost adăugat, dar emailul de invitație nu a putut fi trimis.`
          : `Invitație trimisă către ${em}.`,
      });
      setInviteEmail('');
      incarca();
    } catch (err) {
      setInviteMsg({ ok: false, text: err.response?.data?.detail || 'Eroare la trimiterea invitației.' });
    } finally {
      setInviteBusy(false);
    }
  }

  async function eliminaMembru(em) {
    if (!window.confirm(`Elimini ${em} din arbore?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/members`, { params: { email: em } });
      incarca();
    } catch (e) {
      alert('Eroare la eliminarea membrului.');
    }
  }

  async function revizuiesteCerere(id, actiune) {
    try {
      await axios.post(`${API_BASE}/api/change-requests/${id}/${actiune}`);
      incarca();
    } catch (e) {
      alert('Eroare la procesarea cererii.');
    }
  }

  return (
    <div className="collab-panel">
      <p className="sidebar-group-label">👨‍👩‍👧 Partajare familie</p>

      <LinkBox
        icon="🔗"
        titlu="Link vizualizare activ"
        descriere="Oricine cu acest link poate vedea arborele, fără cont (doar citire)."
        url={linkView}
        onGenereaza={genView}
        onRevoca={revocaView}
        genText="Link vizualizare"
      />

      <LinkBox
        icon="✏️"
        titlu="Link editare activ"
        descriere="Cine deschide acest link (fiind logat) poate adăuga și edita persoane."
        url={linkEdit}
        onGenereaza={genEdit}
        onRevoca={revocaEdit}
        genText="Link editare"
      />

      <p className="sidebar-group-label">✉️ Invită pe email</p>
      <form className="collab-invite" onSubmit={invitaMembru}>
        <input
          className="collab-input"
          type="email"
          placeholder="email@exemplu.ro"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
        />
        <div className="collab-invite-row">
          <select
            className="collab-select"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Vizualizare</option>
          </select>
          <button type="submit" className="collab-invite-btn" disabled={inviteBusy}>
            {inviteBusy ? 'Se trimite...' : 'Invită'}
          </button>
        </div>
      </form>
      {inviteMsg && (
        <p className={`collab-msg ${inviteMsg.ok ? 'collab-msg-ok' : 'collab-msg-err'}`}>
          {inviteMsg.text}
        </p>
      )}

      {membri.length > 0 && (
        <>
          <p className="sidebar-group-label">Membri alăturați</p>
          <ul className="collab-members">
            {membri.map(m => (
              <li key={m.email} className="collab-member">
                <div className="collab-member-info">
                  <span className="collab-member-name">{m.full_name || m.email}</span>
                  <span className="collab-member-meta">
                    {ETICHETA_ROL[m.role] || m.role}
                    {m.status === 'pending' && ' · în așteptare'}
                  </span>
                </div>
                <button
                  className="collab-member-remove"
                  onClick={() => eliminaMembru(m.email)}
                  title="Elimină membrul"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {cereri.length > 0 && (
        <>
          <p className="sidebar-group-label">Cereri in asteptare</p>
          <ul className="collab-members">
            {cereri.map(c => (
              <li key={c.id} className="collab-member">
                <div className="collab-member-info">
                  <span className="collab-member-name">
                    {c.action === 'person_delete' ? 'Stergere persoana' : c.action}
                  </span>
                  <span className="collab-member-meta">
                    {c.payload?.person?.full_name || c.entity_id}
                    {c.reason ? ` · ${c.reason}` : ''}
                  </span>
                </div>
                <button
                  className="collab-member-remove"
                  onClick={() => revizuiesteCerere(c.id, 'approve')}
                  title="Aproba cererea"
                >
                  ✓
                </button>
                <button
                  className="collab-member-remove"
                  onClick={() => revizuiesteCerere(c.id, 'reject')}
                  title="Respinge cererea"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
