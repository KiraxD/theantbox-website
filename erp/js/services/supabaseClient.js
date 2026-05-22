// ============================================================
// THE ANT BOX ERP — supabaseClient.js
// Supabase client singleton initialisation
// ============================================================

// NOTE: Replace these with your actual Supabase project credentials
// Set them in /erp/.env or directly here for local dev
const SUPABASE_URL = window.__ERP_CONFIG__?.supabaseUrl
  || 'https://sojqbyjioukfchdmstnz.supabase.co';

const SUPABASE_ANON_KEY = window.__ERP_CONFIG__?.supabaseAnonKey
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvanFieWppb3VrZmNoZG1zdG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMDEwMDUsImV4cCI6MjA5NDg3NzAwNX0.UUxgLB33WK5sB5q8gY4bbgzMFrAMurU-_nh7qhAlb6w';

// Lazy-load Supabase JS from CDN (ES module compatible)
let _client = null;

async function getSupabaseClient() {
  if (_client) return _client;

  const { createClient } = await import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  );

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'erp_session',
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return _client;
}

export { getSupabaseClient };
export default getSupabaseClient;
