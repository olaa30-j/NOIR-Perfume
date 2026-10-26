/* ============================================================
   NOIR — Supabase Client Initializer
   Reads from window.__ENV__ (loaded by config.js)
   Creates window.db (Supabase client) if configured.
   ============================================================ */

(function initSupabase() {
  try {
    // 1. Check SDK is loaded
    if (typeof supabase === 'undefined') {
      console.warn('[supabase] SDK not loaded. Add the CDN script before this file.');
      return;
    }

    // 2. Check config exists
    if (!window.__ENV__ || !window.__ENV__.SUPABASE_URL || !window.__ENV__.SUPABASE_ANON_KEY) {
      console.warn('[supabase] Config missing. Create js/config.js with window.__ENV__ = { SUPABASE_URL, SUPABASE_ANON_KEY }.');
      return;
    }

    const url = window.__ENV__.SUPABASE_URL;
    const key = window.__ENV__.SUPABASE_ANON_KEY;

    // 3. Check placeholders
    if (url.indexOf('YOUR-PROJECT') === 0 || url.indexOf('YOUR_') === 0 || key.indexOf('YOUR-') === 0) {
      console.warn('[supabase] Placeholder values detected. Replace them with real credentials.');
      return;
    }

    // 4. Create client
    window.db = supabase.createClient(url, key);

    // 5. Expose URL + key for debugging
    window.db.supabaseUrl = url;
    window.db.supabaseKey = key;

    console.info('[supabase] client ready →', url);
  } catch (err) {
    console.error('[supabase] init failed:', err);
  }
})();