import { createContext, useContext } from "react";

export const PortalContext = createContext(null);

export function usePortal() {
  return useContext(PortalContext);
}
