/**
 * Shared Supabase Client Initializer
 * Ensures a single Supabase / GoTrueClient instance per page context.
 */
(function (global) {
  const SUPABASE_URL = 'https://auth.mystudentclub.com';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

  function initClient() {
    if (global.supabaseClient) {
      return global.supabaseClient;
    }
    if (global.supabase && typeof global.supabase.createClient === 'function') {
      global.supabaseClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

      // Cache session synchronously from storage if present
      try {
        const storageKey = 'sb-izsggdtdiacxdsjjncdq-auth-token';
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          global.__mscSession = JSON.parse(raw);
        }
      } catch (e) {
        // ignore parse error
      }

      // Listen for auth changes to keep synchronous session cache up to date
      try {
        global.supabaseClient.auth.onAuthStateChange(function (event, session) {
          global.__mscSession = session || null;
        });
      } catch (e) {
        // ignore
      }

      return global.supabaseClient;
    }
    return null;
  }

  initClient();

  // Expose credentials and getter
  global.__MSC_SUPABASE_URL = SUPABASE_URL;
  global.__MSC_SUPABASE_KEY = SUPABASE_KEY;
  global.getSupabaseClient = initClient;
})(typeof window !== 'undefined' ? window : globalThis);
