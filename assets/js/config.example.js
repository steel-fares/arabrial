/**
 * Copy to config.js for local overrides (config.js is gitignored).
 * On GitHub Pages, deploy config.public.js (committed) — only the Supabase anon key belongs here.
 * NEVER put service_role or admin secrets in client config.
 */
window.ARBR_PUBLIC_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
