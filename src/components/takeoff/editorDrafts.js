/**
 * Hub review HUB 018 — which unfinished drawings on this device deserve a card. A draft whose shape is already
 * the flashing's saved shape is finished (nothing to recover) and never shows as "unfinished". Pure (node-tested).
 */
import { normaliseProfile } from "../../../shared/takeoff/index.js";

const canon = (p) => (p ? JSON.stringify(normaliseProfile(p)) : "null");
/** Same shape after normalising (jsonb key order never matters). Anything that can't be compared counts as different. */
export function sameProfile(a, b) {
  try { return canon(a) === canon(b); } catch { return false; }
}

/**
 * The card for one stored draft, or null when there is nothing to recover.
 * reason: "invalid" (a size that isn't valid yet), "point" (only a start point), "new" (the flashing isn't in the
 * takeoff), "changed" (a different shape from the saved one).
 */
export function editorDraftCard(record, material) {
  const d = record?.draft;
  const present = d?.hist?.present;
  if (!present) return null;
  const invalid = Object.keys(d.drafts || {}).length > 0;
  const shape = !!present.profile, point = !!present.first;
  if (!shape && !point && !invalid) return null;
  const base = { materialId: record.materialId, name: material?.name || record.meta?.name || null, isNew: !material };
  if (invalid) return { ...base, reason: "invalid" };
  if (!material) return { ...base, reason: shape ? "new" : "point" };
  if (!shape) return { ...base, reason: "point" };
  if (sameProfile(present.profile, material.profile)) return null;
  return { ...base, reason: "changed" };
}

/** The flashing to reopen a draft into when it isn't in the takeoff: its own name, never a made-up "New flashing". */
export function materialForDraft(record, fallback) {
  return { ...fallback, id: record.materialId, name: record.meta?.name || fallback.name };
}

/** The short reason shown on the card. */
export function draftCardText(card) {
  return card.reason === "invalid" ? " (has a size that isn't valid yet)." : card.reason === "changed" ? " — newer than the saved drawing." : " — not in the takeoff yet.";
}
