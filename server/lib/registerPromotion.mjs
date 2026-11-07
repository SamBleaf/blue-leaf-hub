/**
 * registerPromotion.mjs — Master Register promote-once entry point (R02 Increment 2 → R03).
 *
 * Kept as the stable import used by salesRoutes (preconstruction-portal setup + finalizeWonJob). Since R03
 * the implementation lives in registerStore.mjs and runs as ONE atomic register_apply(mode='promote') call
 * (migration 213): the lead scratchpad is mapped once into the canonical project records — genuine
 * product/finish CHOICES into client_selections STAGED (client_visible=false, no client action, no
 * notification); scope, requirements, actions and settled-out selections into internal room_scope_items;
 * the room list into projects.register_meta. A second call is a no-op ("already promoted"); after
 * promotion every register edit writes the canonical records directly (no snapshot, no re-sync).
 *
 * Non-fatal by contract — callers wrap in try/catch; a failure here never blocks a stage move or a win,
 * writes nothing (one transaction), and is retried automatically the next time the register is opened.
 */
export { promoteRegisterToProject } from "./registerStore.mjs";
