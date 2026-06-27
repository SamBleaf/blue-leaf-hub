import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;

export async function getAccessToken(email, password) {
  if (!SB_URL || !SB_ANON) {
    throw new Error("Missing SUPABASE_URL / VITE_SUPABASE_ANON_KEY for E2E auth");
  }
  const sb = createClient(SB_URL, SB_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${error?.message || "no session"}`);
  }
  return data.session.access_token;
}

export async function waitForAppSession(page) {
  await page.waitForFunction(() => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.includes("auth-token")) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.access_token || parsed?.currentSession?.access_token) return true;
      }
    } catch {
      /* ignore parse errors */
    }
    return false;
  }, { timeout: 20_000 });
}

/** Playwright page login via UI */
export async function loginViaUI(page, { email, password, expectPath = null }) {
  await page.goto("/login");
  await page.getByRole("heading", { name: "Sign in" }).waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  if (expectPath) {
    await page.waitForURL((url) => url.pathname.startsWith(expectPath), { timeout: 30_000 });
  } else {
    // Wait until we leave /login
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  }
  await waitForAppSession(page);
}

/** Dismiss director/supervisor role picker if shown */
export async function dismissRolePicker(page, choice = "director") {
  const directorBtn = page.getByRole("button", { name: /Director \/ Manager/i });
  const supervisorBtn = page.getByRole("button", { name: /Site Supervisor/i });
  try {
    if (choice === "supervisor" && (await supervisorBtn.isVisible({ timeout: 3000 }))) {
      await supervisorBtn.click();
    } else if (await directorBtn.isVisible({ timeout: 3000 })) {
      await directorBtn.click();
    }
  } catch {
    /* picker not shown */
  }
}

export async function logoutViaUI(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/login");
}
