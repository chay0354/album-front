import { createClient } from "@supabase/supabase-js";

/** Anon key is public in the browser; required only for large PDF → Storage signed upload. */
export function getSupabaseBrowserClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
