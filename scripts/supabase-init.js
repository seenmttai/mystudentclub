/**
 * Shared Supabase Client Initializer
 * Ensures a single Supabase / GoTrueClient instance per page context.
 */
(function (global) {
  const SUPABASE_URL = 'https://auth.mystudentclub.com';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

  let boundClient = null;
  function initClient() {
    if (!global.supabaseClient && global.supabase && typeof global.supabase.createClient === 'function') {
      global.supabaseClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    const db = global.supabaseClient;
    if (!db) return null;
    if (boundClient === db) return db;
    boundClient = db;

    try {
      const raw = localStorage.getItem('sb-izsggdtdiacxdsjjncdq-auth-token');
      if (raw) global.__mscSession = JSON.parse(raw);
    } catch (_) { /* storage may be unavailable */ }

    try {
      let previousUserId = global.__mscSession?.user?.id || null;
      db.auth.onAuthStateChange(function (event, session) {
        const nextUserId = session?.user?.id || null;
        if (event === 'SIGNED_OUT' || (previousUserId && previousUserId !== nextUserId)) {
          try {
            Object.keys(sessionStorage).forEach(key => {
              if (key === 'msc_lead_submitted' || key.startsWith('msc_career_v2:') || key === 'msc_career_auth_pending' || key === 'msc_career_auth_redirect' || key === 'msc_profile_tour') sessionStorage.removeItem(key);
            });
            ['userProfileData', 'msc_profile_cache_owner', 'userCVText', 'userCVFileName', 'userCVImages', 'userCVPdf',
              'userCoverLetterText', 'userCoverLetterFileName', 'cv_cloud_synced', 'cv_images_synced',
              'userJobPreference', 'newUserSignup', 'newUserEmail'].forEach(key => localStorage.removeItem(key));
          } catch (_) { /* clearing UI state must still proceed if storage is blocked */ }
          document.cookie = 'cv_cloud_synced=; Max-Age=0; path=/';
          global._wzCVImages = null;
          global._wzCVPdf = null;
          global.MSCCareerProfile?.clearGuestState();
        }
        previousUserId = nextUserId;
        global.__mscSession = session || null;
      });
    } catch (_) { /* auth client may still be initializing */ }
    return db;
  }

  initClient();

  // Expose credentials and getter
  global.__MSC_SUPABASE_URL = SUPABASE_URL;
  global.__MSC_SUPABASE_KEY = SUPABASE_KEY;
  global.getSupabaseClient = initClient;
})(typeof window !== 'undefined' ? window : globalThis);
