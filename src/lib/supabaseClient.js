import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim?.();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim?.();

export const supabaseConfigured = Boolean(url && key);

/** Dispatched whenever the singleton client is invalidated (e.g. storage scope change before login). */
export const SUPABASE_AUTH_CLIENT_RESET = "hub_supabase_auth_client_reset";

/** Determines where Supabase stores the auth session. 'session' = sessionStorage (tab lifetime). */
let authPersistMode = "local";
/** @type {import('@supabase/supabase-js').SupabaseClient|null} */
let supabaseSingleton = null;

/**
 * Configure where the Supabase Auth client persists its session BEFORE the next call to {@link getSupabase}.
 * - `local`: localStorage — survives browser restart (remember me ON).
 * - `session`: sessionStorage — discarded when tab closes (remember me OFF).
 * Invalidates the cached client when the choice changes so a new storage backend is wired in.
 *
 * @param {'local' | 'session'} mode
 */
export function configureSupabaseAuthStorage(mode) {
  const next = mode === "session" ? "session" : "local";
  if (authPersistMode === next) {
    if (supabaseSingleton) return;
    return;
  }
  authPersistMode = next;
  supabaseSingleton = null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SUPABASE_AUTH_CLIENT_RESET));
}

/** @returns {import('@supabase/supabase-js').SupabaseClient|null} */
export function getSupabase() {
  if (!supabaseConfigured) return null;
  if (supabaseSingleton) return supabaseSingleton;

  const useSession = authPersistMode === "session";
  supabaseSingleton = createClient(url, key, {
    auth: {
      persistSession: true,
      storage: typeof window !== "undefined" ? (useSession ? window.sessionStorage : window.localStorage) : undefined,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return supabaseSingleton;
}
