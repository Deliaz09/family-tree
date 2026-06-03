import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/AuthPage';
import TreePage from './pages/TreePage';
import PersonPage from './pages/PersonPage';
import ImportPage from './pages/ImportPage';
import PublicViewPage from './pages/PublicViewPage';
import JoinPage from './pages/JoinPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

export default function App() {

  if (window.location.pathname.startsWith('/view/')) {
    return <PublicViewPage />;
  }

  if (window.location.pathname.startsWith('/join/')) {
    return <JoinPage />;
  }

  if (window.location.pathname.startsWith('/verify-email')) {
    return <VerifyEmailPage />;
  }

  if (window.location.pathname.startsWith('/reset-password')) {
    return <ResetPasswordPage />;
  }

  const {
    user,
    profile,
    loading,
    login,
    register,
    logout,
    resendVerification,
    resetPassword,
    updatePassword,
    recoveryMode,
    urlError,
    clearUrlError,
    isAuthenticated,
  } = useAuth();

  const [currentPage,      setCurrentPage]      = useState('tree');
  const [selectedPersonId, setSelectedPersonId] = useState(null);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Se încarcă...</p>
      </div>
    );
  }

  if (!isAuthenticated || recoveryMode) {
    return (
      <AuthPage
        onLogin={login}
        onRegister={register}
        onResendVerification={resendVerification}
        onResetPassword={resetPassword}
        onUpdatePassword={updatePassword}
        recoveryMode={recoveryMode}
        urlError={urlError}
        onClearUrlError={clearUrlError}
      />
    );
  }

  const pendingJoin = localStorage.getItem('pendingJoinToken');
  if (pendingJoin) {
    window.location.href = `/join/${pendingJoin}`;
    return (
      <div className="page-loading">
        <div className="loader"></div>
        <p>Te alături arborelui partajat...</p>
      </div>
    );
  }

  if (currentPage === 'import') {
    return (
      <ImportPage
        onBack={() => setCurrentPage('tree')}
        onImported={() => setCurrentPage('tree')}
      />
    );
  }

  if (currentPage === 'person' && selectedPersonId) {
    return (
      <PersonPage
        personId={selectedPersonId}
        onBack={() => setCurrentPage('tree')}
        onNavigate={(id) => { setSelectedPersonId(id); setCurrentPage('person'); }}
      />
    );
  }

  return (
    <TreePage
      onNavigatePerson={(id) => { setSelectedPersonId(id); setCurrentPage('person'); }}
      onImport={() => setCurrentPage('import')}
      onLogout={logout}
      userName={profile?.full_name || user?.email || ''}
    />
  );
}
