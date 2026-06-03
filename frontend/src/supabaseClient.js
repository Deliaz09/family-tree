import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('⚠️ Variabilele Supabase nu sunt setate! Verifică .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let seDeconecteaza = false;
async function deconecteazaSesiuneMoarta() {
  if (seDeconecteaza) return;
  seDeconecteaza = true;
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { }
  setTimeout(() => { seDeconecteaza = false; }, 2000);
}

axios.interceptors.request.use(async (config) => {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
      const { data } = await supabase.auth.refreshSession();
      if (data?.session) {
        session = data.session;
      } else {
        await deconecteazaSesiuneMoarta();
        session = null;
      }
    }
    if (session?.access_token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) await deconecteazaSesiuneMoarta();
      } catch { }
    }
    return Promise.reject(error);
  },
);
