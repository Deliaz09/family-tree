import { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from '../supabaseClient';
import { API_BASE } from '../utils/apiBase';

function tokenDinUrl() {
  const m = window.location.pathname.match(/\/join\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function JoinPage() {
  const [stare, setStare] = useState('verificare');
  const [mesaj, setMesaj] = useState('');

  useEffect(() => {
    const token = tokenDinUrl();
    if (!token) { setStare('eroare'); setMesaj('Link invalid.'); return; }

    let activ = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {

        localStorage.setItem('pendingJoinToken', token);
        if (activ) setStare('neautentificat');
        return;
      }

      try {
        if (activ) setStare('join');
        const res = await axios.post(
          `${API_BASE}/api/collab/join/${token}`,
          {},
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        localStorage.removeItem('pendingJoinToken');

        if (res.data.role === 'owner') {
          if (activ) {
            setStare('eroare');
            setMesaj('Acesta este chiar arborele tău — ești deja proprietar. ' +
                     'Ca să testezi rolul de editor, deschide linkul dintr-un alt cont (fereastră incognito).');
          }
          return;
        }

        localStorage.setItem('lastJoinedTree', res.data.tree_id);
        if (activ) { setStare('gata'); setMesaj('Te-ai alăturat arborelui! Te redirecționăm...'); }
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } catch (err) {
        if (!activ) return;
        localStorage.removeItem('pendingJoinToken');
        setStare('eroare');
        setMesaj(err.response?.data?.detail || 'Nu te-ai putut alătura arborelui.');
      }
    })();

    return () => { activ = false; };
  }, []);

  if (stare === 'verificare' || stare === 'join') {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>{stare === 'join' ? 'Te alături arborelui...' : 'Se verifică linkul...'}</p>
      </div>
    );
  }

  if (stare === 'neautentificat') {
    return (
      <div className="page-error">
        <h2>Autentificare necesară</h2>
        <p>Ca să te alături acestui arbore și să poți adăuga persoane, autentifică-te mai întâi.
           După logare, alăturarea se face automat.</p>
        <a className="btn-primary" href="/">Mergi la autentificare</a>
      </div>
    );
  }

  if (stare === 'gata') {
    return (
      <div className="page-error">
        <h2>✅ Gata!</h2>
        <p>{mesaj}</p>
      </div>
    );
  }

  return (
    <div className="page-error">
      <h2>Nu s-a putut realiza alăturarea</h2>
      <p>{mesaj}</p>
      <button
        className="btn-primary"
        onClick={() => { localStorage.removeItem('pendingJoinToken'); window.location.href = '/'; }}
      >
        Mergi la pagina principală
      </button>
    </div>
  );
}
