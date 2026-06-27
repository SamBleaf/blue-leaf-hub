import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const RUNTIME_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", ".runtime.json");

export function loadRuntime() {
  if (!existsSync(RUNTIME_PATH)) {
    throw new Error(
      "e2e/.runtime.json missing — global-setup did not run. Start tests via `npm run test:e2e`."
    );
  }
  return JSON.parse(readFileSync(RUNTIME_PATH, "utf8"));
}

export function getUser(role) {
  const rt = loadRuntime();
  const user = rt.users?.[role];
  if (!user?.email || !user?.password) {
    throw new Error(`No E2E user for role "${role}" in runtime`);
  }
  return user;
}
