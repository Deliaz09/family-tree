import { useState, useEffect } from 'react';

export default function AuthPage({
  onLogin, onRegister, onResendVerification, onResetPassword, onUpdatePassword,
  recoveryMode, urlError, onClearUrlError,
}) {
  const [mode,    setMode]    = useState('login');
  const [email,   setEmail]   = useState('');
  const [password,setPassword]= useState('');
  const [password2, setPassword2] = useState('');
  const [name,    setName]    = useState('');
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (recoveryMode) setMode('reset');
  }, [recoveryMode]);

  useEffect(() => {
    if (urlError) {
      if (urlError.toLowerCase().includes('expired')) {
        setError('⚠ Link-ul de confirmare a expirat sau a fost deja folosit. Înregistrează-te din nou pentru un link nou.');
      } else {
        setError(urlError);
      }
    }
  }, [urlError]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else if (mode === 'forgot') {
        await onResetPassword(email);
        setSuccess('📧 Am trimis un email cu link-ul de resetare a parolei. Verifică inbox-ul (și folderul Spam).');
      } else if (mode === 'reset') {
        if (password.length < 6) {
          setError('Parola trebuie să aibă minim 6 caractere.');
          setLoading(false);
          return;
        }
        if (password !== password2) {
          setError('Parolele nu coincid.');
          setLoading(false);
          return;
        }
        await onUpdatePassword(password);
        setSuccess('✓ Parola a fost schimbată. Te poți autentifica acum.');
        setMode('login');
        setPassword('');
        setPassword2('');
      } else {
        if (password.length < 6) {
          setError('Parola trebuie să aibă minim 6 caractere.');
          setLoading(false);
          return;
        }
        await onRegister(email, password, name);
        if (onClearUrlError) onClearUrlError();
        setMode('email-sent');
      }
    } catch (err) {
      const msg = err.message || 'Eroare la autentificare';

      if (msg.includes('Email not confirmed')) {
        setError('Contul tău nu a fost confirmat încă. Verifică emailul.');
      } else if (msg.includes('Invalid login credentials')) {
        setError('Email sau parolă incorectă.');
      } else if (msg.includes('User already registered')) {
        setError('Există deja un cont cu acest email. Încearcă să te loghezi.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError(null);
    try {
      await onResendVerification(email);
      setSuccess('📧 Emailul de confirmare a fost retrimis.');
    } catch (err) {
      setError(err.message || 'Eroare la retrimitere.');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'email-sent') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">📧</div>
          <h1>Verifică emailul</h1>
          <p className="auth-subtitle" style={{ textAlign: 'center', lineHeight: 1.6 }}>
            Am trimis un email de confirmare la<br />
            <strong>{email}</strong>
          </p>
          <div className="auth-info-box">
            <p>📬 Deschide emailul și apasă pe link-ul de <strong>confirmare a contului</strong>.</p>
            <p style={{ marginTop: 8, fontSize: 13, color: '#7a6e8a' }}>
              După confirmare, revino și autentifică-te cu emailul și parola. Verifică și folderul Spam.
            </p>
          </div>
          {success && <div className="auth-success">{success}</div>}
          {error && <div className="auth-error">{error}</div>}
          <button
            className="auth-btn"
            onClick={handleResend}
            disabled={loading}
            style={{ marginTop: 12 }}
          >
            {loading ? 'Se trimite...' : '📧 Retrimite emailul'}
          </button>
          <button
            className="auth-btn"
            style={{
              background: 'transparent',
              color: '#7c6b9e',
              border: '1.5px solid #7c6b9e',
              marginTop: 8,
            }}
            onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
          >
            Înapoi la login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🌳</div>
        <h1>Arbore Genealogic</h1>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Intră în contul tău'
            : mode === 'forgot' ? 'Resetează parola'
            : mode === 'reset' ? 'Alege o parolă nouă'
            : 'Creează un cont nou'}
        </p>

        {success && <div className="auth-success">{success}</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="auth-field">
              <span>Numele tău</span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ex: Maria Popescu"
                autoComplete="name"
                required
              />
            </label>
          )}

          {mode !== 'reset' && (
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@exemplu.com"
                required
                autoComplete="email"
              />
            </label>
          )}

          {mode !== 'forgot' && (
            <label className="auth-field">
              <span>{mode === 'reset' ? 'Parola nouă' : 'Parolă'}</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'login' ? 'Parola ta' : 'Minim 6 caractere'}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={6}
              />
            </label>
          )}

          {mode === 'reset' && (
            <label className="auth-field">
              <span>Confirmă parola nouă</span>
              <input
                type="password"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                placeholder="Repetă parola"
                required
                autoComplete="new-password"
                minLength={6}
              />
            </label>
          )}

          {mode === 'login' && (
            <div className="auth-forgot">
              <button type="button" onClick={() => { setMode('forgot'); setError(null); setSuccess(null); }}>
                Am uitat parola
              </button>
            </div>
          )}

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading
              ? 'Se procesează...'
              : mode === 'login'
                ? 'Intră în cont'
                : mode === 'forgot'
                  ? 'Trimite link de resetare'
                  : mode === 'reset'
                    ? 'Salvează parola nouă'
                    : 'Creează contul'}
          </button>
        </form>

        {mode !== 'reset' && (
        <div className="auth-switch">
          {mode === 'login' ? (
            <p>
              Nu ai cont?{' '}
              <button onClick={() => { setMode('register'); setError(null); setSuccess(null); }}>
                Înregistrează-te
              </button>
            </p>
          ) : mode === 'forgot' ? (
            <p>
              Ți-ai amintit parola?{' '}
              <button onClick={() => { setMode('login'); setError(null); setSuccess(null); }}>
                Înapoi la login
              </button>
            </p>
          ) : (
            <p>
              Ai deja cont?{' '}
              <button onClick={() => { setMode('login'); setError(null); setSuccess(null); }}>
                Autentifică-te
              </button>
            </p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
