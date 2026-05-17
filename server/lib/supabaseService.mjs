import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let ws;
try { ws = require("ws"); } catch { ws = undefined; }

/** Server-side Supabase (service role). Optional for reminders / unmatched list. */
export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, ws ? { realtime: { transport: ws } } : {});
}
