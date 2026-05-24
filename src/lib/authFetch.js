/**
 * authFetch — wraps fetch() with the current Supabase session Bearer token.
 * Used by all routes that require server-side authentication (requireAuth middleware).
 */
import { getSupabase } from "./supabaseClient.js";

export async function authFetch(url, options = {}) {
  let token = null;
  try {
    const sb = getSupabase();
    if (sb) {
      const { data: { session } } = await sb.auth.getSession();
      token = session?.access_token || null;
    }
  } catch {
    // Non-fatal — request will proceed without auth header and receive 401
  }

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
