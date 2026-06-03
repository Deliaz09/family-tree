import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../utils/apiBase';

function tokenDinUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

export default function VerifyEmailPage() {
  const [stare, setStare] = useState('verificare');
  const [mesaj, setMesaj] = useState('');

  useEffect(() => {
    const token = tokenDinUrl();
    if (!token) { setStare('eroare'); setMesaj('Link de verificare invalid.'); return; }

    let activ = true;
    (async () => {
      try {
        await axios.post(`${API_BASE}/api/auth/verify-email`, { token });
        if (activ) setStare('gata');
      } catch (err) {
        if (!activ) return;
        setStare('eroare');
        setMesaj(err.response?.data?.detail || 'Verificarea a eșuat.');
      }
    })();

    return () => { activ = false; };
  }, []);

  if (stare === 'verificare') {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Se confirmă adresa de email...</p>
      </div>
    );
  }

  if (stare === 'gata') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">✅</div>
          <h1>Email confirmat</h1>
          <p className="auth-subtitle" style={{ textAlign: 'center', lineHeight: 1.6 }}>
            Adresa ta de email a fost confirmată cu succes.<br />
            Te poți autentifica acum în aplicație.
          </p>
          <a className="auth-btn" href="/" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>
            Mergi la autentificare
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">⚠️</div>
        <h1>Verificare eșuată</h1>
        <p className="auth-subtitle" style={{ textAlign: 'center', lineHeight: 1.6 }}>{mesaj}</p>
        <a className="auth-btn" href="/" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>
          Mergi la pagina principală
        </a>
      </div>
    </div>
  );
}
