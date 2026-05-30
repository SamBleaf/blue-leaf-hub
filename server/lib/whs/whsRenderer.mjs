// WHS markdown renderer — substitutes {{merge_field}} from a context.
// Arrays render as markdown bullet lists. Empty values are flagged so the
// generator can report missing (and missing *required*) fields.
//
// Phase 1: flat fields + list fields. Repeating-row tables ({{#rows}} loops for
// registers / worker sign-on) are deferred to the register/SWMS phase.

import { REQUIRED_FIELDS } from "./whsMergeFields.mjs";

const FIELD_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * @param {string} markdown - template text containing {{field}} tokens
 * @param {object} context - merge-field map (string | number | string[])
 * @returns {{ rendered: string, referenced: string[], missing: string[], missingRequired: string[] }}
 */
export function renderTemplate(markdown, context = {}) {
  const referenced = new Set();
  const empty = new Set();

  const rendered = String(markdown || "").replace(FIELD_RE, (_match, rawKey) => {
    const key = rawKey.trim();
    referenced.add(key);
    const val = context[key];

    if (Array.isArray(val)) {
      if (val.length === 0) { empty.add(key); return "_None recorded_"; }
      return val.map((item) => `- ${item}`).join("\n");
    }
    if (val == null || String(val).trim() === "") {
      empty.add(key);
      return `_[to be completed: ${key}]_`;
    }
    return String(val);
  });

  const missing = [...empty];
  const missingRequired = missing.filter((k) => REQUIRED_FIELDS.includes(k));
  return { rendered, referenced: [...referenced], missing, missingRequired };
}
