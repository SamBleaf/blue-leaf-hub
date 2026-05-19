import { useCallback, useState } from "react";

const ROLE_KEY = "blhub_role";

export function useRole() {
  const [role, setRoleState] = useState(() => {
    try { return localStorage.getItem(ROLE_KEY) || null; } catch { return null; }
  });

  const setRole = useCallback((r) => {
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
    setRoleState(r);
  }, []);

  const clearRole = useCallback(() => {
    try { localStorage.removeItem(ROLE_KEY); } catch { /* ignore */ }
    setRoleState(null);
  }, []);

  return { role, setRole, clearRole, isDirector: role === "director", isSupervisor: role === "supervisor" };
}

export function getStoredRole() {
  try { return localStorage.getItem(ROLE_KEY) || null; } catch { return null; }
}
