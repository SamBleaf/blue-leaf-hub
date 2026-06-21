import { createContext, useContext } from "react";

/**
 * ClientPortalContext — provided by ClientPortalLayout, consumed by every
 * client-portal v2 page. Carries the resolved projectId + session so pages never
 * re-resolve it themselves.
 *
 * Shape:
 *   {
 *     projectId: string,
 *     session: { projectId, role, isAuthenticated, authType, buildPhase,
 *                address, clientName, portalV2Enabled } | null,
 *     buildPhase: string|null,
 *     clientName: string|null,
 *     address: string|null,
 *     refreshSession: () => void,
 *   }
 */
export const ClientPortalContext = createContext(null);

/** Read the current client-portal context. Returns null outside the layout. */
export function useClientPortal() {
  return useContext(ClientPortalContext);
}
