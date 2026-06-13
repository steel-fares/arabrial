import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://umxmwcwuwsvkvsbdhbdl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVteG13Y3d1d3N2a3ZzYmRoYmRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDYwNjcsImV4cCI6MjA5NTAyMjA2N30.qCwKT7EU21JJKS-_73_uuXdLrhoI3a9644Wk73O2uJY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
