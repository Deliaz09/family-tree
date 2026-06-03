import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { supabase } from '../supabaseClient';
import { API_BASE } from '../utils/apiBase';

function setAxiosToken(token) {
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
}

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [urlError, setUrlError] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {

        const hash = window.location.hash;
        if (hash.includes('error=')) {
          const params = new URLSearchParams(hash.substring(1));
          const errDesc = params.get('error_description') || 'Link invalid sau expirat';
          if (mounted) setUrlError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
          window.history.replaceState({}, '', window.location.pathname);
        }

        const { data: { session } } = await supabase.auth.getSession();

        if (mounted && session) {
          setUser(session.user);
          setAxiosToken(session.access_token);

          loadProfile(session.user.id);
        }
      } catch (err) {
        console.error('Eroare auth init:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    async function loadProfile(userId) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          console.warn('Profile fetch error:', error.message);
          return;
        }

        if (mounted && data) {
          setProfile(data);
        } else if (mounted) {

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: newProfile } = await supabase
              .from('profiles')
              .upsert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email,
              })
              .select()
              .maybeSingle();
            if (mounted && newProfile) setProfile(newProfile);
          }
        }
      } catch (err) {
        console.warn('Profile load failed:', err);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true);
        }
        if (session) {
          setUser(session.user);
          setAxiosToken(session.access_token);
          loadProfile(session.user.id);
          setUrlError(null);
        } else {
          setUser(null);
          setProfile(null);
          setAxiosToken(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const register = useCallback(async (email, password, fullName) => {
    try {
      const res = await axios.post(`${API_BASE}/api/auth/register`, {
        email,
        password,
        full_name: fullName,
      });
      return res.data;
    } catch (err) {
      throw new Error(err.response?.data?.detail || 'Eroare la crearea contului.');
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    setUrlError(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setAxiosToken(null);
  }, []);

  const resendVerification = useCallback(async (email) => {
    try {
      await axios.post(`${API_BASE}/api/auth/resend-verification`, { email });
    } catch (err) {
      throw new Error(err.response?.data?.detail || 'Eroare la retrimitere.');
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    try {
      await axios.post(`${API_BASE}/api/auth/request-password-reset`, { email });
    } catch (err) {
      throw new Error(err.response?.data?.detail || 'Eroare la trimiterea linkului de resetare.');
    }
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setRecoveryMode(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await axios.post(`${API_BASE}/api/email/password-changed`, {
        email: user?.email || '',
        full_name: user?.user_metadata?.full_name || '',
      });
    } catch (e) {
      console.warn('Notificarea de schimbare parolă nu a putut fi trimisă:', e);
    }
  }, []);

  const clearUrlError = useCallback(() => setUrlError(null), []);

  return {
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
    isAuthenticated: !!user,
    isEmailVerified: !!user?.email_confirmed_at,
  };
}
