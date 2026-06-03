import { useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../utils/apiBase';

function tokenDinUrl() {
  const query = new URLSearchParams(window.location.search);
  const tokenFromQuery = query.get('token');
  if (tokenFromQuery) return tokenFromQuery;

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;

  const hashParams = new URLSearchParams(hash);
  return hashParams.get('token') || hashParams.get('access_token');
}

export default function ResetPasswordPage() {
  const token = useMemo(() => tokenDinUrl(), []);
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [stare, setStare]   = useState(token ? 'form' : 'eroare');
  const [mesaj, setMesaj]   = useState(token ? '' : 'Link de resetare invalid.');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMesaj('');
    if (password.length < 6) { setMesaj('Parola trebuie să aibă minim 6 caractere.'); return; }
    if (password !== password2) { setMesaj('Parolele nu coincid.'); return; }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/reset-password`, { token, password });
      setStare('gata');
    } catch (err) {
      setMesaj(err.response?.data?.detail || err.message || 'Resetarea a eșuat.');
    } finally {
      setLoading(false);
    }
  }

  if (stare === 'gata') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">✅</div>
          <h1>Parolă schimbată</h1>
          <p className="auth-subtitle" style={{ textAlign: 'center', lineHeight: 1.6 }}>
            Parola ta a fost schimbată cu succes.<br />Te poți autentifica acum.
          </p>
          <a className="auth-btn" href="/" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>
            Mergi la autentificare
          </a>
        </div>
      </div>
    );
  }

  if (stare === 'eroare') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">⚠️</div>
          <h1>Link invalid</h1>
          <p className="auth-subtitle" style={{ textAlign: 'center' }}>{mesaj}</p>
          <a className="auth-btn" href="/" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 12 }}>
            Mergi la pagina principală
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🔑</div>
        <h1>Alege o parolă nouă</h1>
        <p className="auth-subtitle">Introdu noua parolă pentru contul tău.</p>
        {mesaj && <div className="auth-error">{mesaj}</div>}
        <form onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Parola nouă</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minim 6 caractere"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <label className="auth-field">
            <span>Confirmă parola nouă</span>
            <input
              type="password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder="Repetă parola"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Se salvează...' : 'Salvează parola nouă'}
          </button>
        </form>
      </div>
    </div>
  );
}
