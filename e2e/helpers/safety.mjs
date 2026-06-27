/**
 * Guards against running destructive E2E against production frontends.
 * API tests still use whatever Supabase is in .env — use a dedicated test project in CI.
 */

const BLOCKED_APP_HOSTS = [
  "blueleafbuilding.com.au",
  "hub.blueleaf",
  "vercel.app", // block unless explicitly allowed
];

export function assertSafeE2EEnvironment() {
  const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5174";
  const allowRemote = process.env.E2E_ALLOW_REMOTE === "true";

  let host;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`Invalid E2E_BASE_URL: ${baseUrl}`);
  }

  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal && !allowRemote) {
    throw new Error(
      `Refusing E2E against non-local host "${host}". ` +
        `Set E2E_BASE_URL to localhost:5174 or E2E_ALLOW_REMOTE=true with caution.`
    );
  }

  if (!allowRemote && BLOCKED_APP_HOSTS.some((h) => host.includes(h))) {
    throw new Error(`Refusing E2E against production-like host: ${host}`);
  }

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  if (process.env.E2E_REQUIRE_TEST_PROJECT === "true") {
    const ref = process.env.E2E_SUPABASE_PROJECT_REF;
    if (!ref || !sbUrl.includes(ref)) {
      throw new Error(
        "E2E_REQUIRE_TEST_PROJECT=true but E2E_SUPABASE_PROJECT_REF does not match SUPABASE_URL"
      );
    }
  }
}

export function isWriteModeEnabled() {
  return process.env.E2E_WRITE === "true" || process.env.E2E_WRITE === "1";
}
