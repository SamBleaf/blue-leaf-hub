// Shared by verify-lintels-vs-pdf.mjs and add-mgp10-bearing.mjs: reads one MGP10 lintel table page from the licensed PDF.
// The PDF prints "extra bearing" as a small subscript after the span (e.g. 900 with a 5), and pdftotext fuses them ("9005").
// A span is always a multiple of 100, so a token that doesn't end in 00 is span + subscript.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

export const PDF = `${homedir()}/Documents/AS 1684 Span Tables/Non-cyclonic/N1N2/MGP10.PDF`;

export function splitCell(tok) {
  if (/^\d{3,4}$/.test(tok) && /00$/.test(tok)) return { span: +tok, extra: 0 };
  for (const k of [4, 3]) {
    const head = tok.slice(0, k), rest = tok.slice(k);
    if (/^[1-9]\d?00$|^[1-9]00$/.test(head) && /^[1-9]\d?$/.test(rest) && +head >= 600) return { span: +head, extra: +rest };
  }
  return null;
}

/** @returns {Map<string,{spans:number[],extra:number[]}>|null} size → cells (null cell → whole row unreadable) */
export function readPage(page) {
  const txt = execFileSync("pdftotext", ["-layout", "-f", String(page), "-l", String(page), PDF, "-"], { encoding: "utf8" });
  const found = new Map();
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*((?:\d\/)?\d{2,3}x\d{2,3})\s+((?:\d{3,6}\s+)*\d{3,6})\s*$/);
    if (!m) continue;
    const cells = m[2].trim().split(/\s+/).map(splitCell);
    if (cells.some((c) => !c)) { found.set(m[1], null); continue; }
    found.set(m[1], { spans: cells.map((c) => c.span), extra: cells.map((c) => c.extra) });
  }
  return found;
}
