// Document fonts — unit tests. Run: node scripts/tests/document-fonts.test.mjs
// The bundled Lato is the recorded official release, it is copied into a LibreOffice profile where Linux LibreOffice
// reads it, a broken font folder never stops a conversion, and the startup check's test document and verdict are right.
// With LibreOffice installed it also runs the real check (on macOS that proves the code path, not Railway: CoreText).
import { createHash } from "crypto";
import fs from "fs";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import PizZip from "pizzip";
import { BUNDLED_FONT_DIR, installProfileFonts, pdfFontNames, findSoffice } from "../../server/lib/docxToPdf.mjs";
import { latoProbeDocx, checkLatoRendering, latoCheckLine, LATO_FACES } from "../../server/lib/documentFonts.mjs";

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${name}`); } };
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// 1. The bundled files are exactly the ones recorded in SHA256SUMS (the official Lato 2.015 release + its licence).
const sums = fs.readFileSync(join(BUNDLED_FONT_DIR, "SHA256SUMS"), "utf8").trim().split("\n").map((l) => l.split(/\s+/));
ok(sums.length === 4, "SHA256SUMS lists three fonts and OFL.txt");
for (const [hash, name] of sums) ok(sha(join(BUNDLED_FONT_DIR, name)) === hash, `${name} matches its recorded sha256`);
ok(["Lato-Regular.ttf", "Lato-Bold.ttf", "Lato-Italic.ttf", "OFL.txt"].every((f) => fs.existsSync(join(BUNDLED_FONT_DIR, f))), "Regular, Bold, Italic and the OFL licence are bundled");
ok(/SIL OPEN FONT LICENSE Version 1\.1/.test(fs.readFileSync(join(BUNDLED_FONT_DIR, "OFL.txt"), "utf8")), "OFL.txt is the SIL OFL 1.1");

// 2. Copied into <profile>/user/fonts, the folder LibreOffice on Linux adds as application fonts.
const tmp = await mkdtemp(join(tmpdir(), "blb-fonts-test-"));
try {
  const copied = await installProfileFonts(join(tmp, "lo-profile"));
  ok(JSON.stringify(copied) === JSON.stringify(["Lato-Bold.ttf", "Lato-Italic.ttf", "Lato-Regular.ttf"]), "three TTFs copied (not the licence or the checksum file)");
  for (const f of copied) ok(sha(join(tmp, "lo-profile", "user", "fonts", f)) === sha(join(BUNDLED_FONT_DIR, f)), `${f} copied intact`);
  // Calling it again on the same profile (a retry) is fine.
  ok((await installProfileFonts(join(tmp, "lo-profile"))).length === 3, "copying twice into one profile is harmless");
  // A missing font folder warns and returns nothing: the conversion still goes ahead.
  const warn = console.warn; let warned = ""; console.warn = (m) => { warned = String(m); };
  const none = await installProfileFonts(join(tmp, "p2"), join(tmp, "no-such-dir"));
  console.warn = warn;
  ok(none.length === 0 && /\[document-fonts\]/.test(warned), "a missing font folder warns and doesn't throw");
} finally {
  await rm(tmp, { recursive: true, force: true });
}

// 3. The startup check's test document asks for Lato in Regular, Bold and Italic.
const xml = new PizZip(latoProbeDocx()).file("word/document.xml").asText();
ok((xml.match(/w:ascii="Lato"/g) || []).length === 3 && xml.includes("<w:b/>") && xml.includes("<w:i/>"), "test DOCX: three Lato runs, one bold, one italic");

// 4. Font names read from a PDF, and the one-line verdict.
const fakePdf = Buffer.from("<< /Type /Font /BaseFont /BAAAAA+Lato-Regular >> << /BaseFont /CAAAAA+Lato-Bold >> << /BaseFont/DejaVuSans >>", "latin1");
ok(JSON.stringify(pdfFontNames(fakePdf)) === JSON.stringify(["Lato-Regular", "Lato-Bold", "DejaVuSans"]), "subset prefixes are stripped");
ok(/Lato OK/.test(latoCheckLine({ ok: true, fonts: LATO_FACES, ms: 900 })), "pass line says Lato OK");
const failLine = latoCheckLine({ ok: false, reason: "missing Lato-Regular, Lato-Bold, Lato-Italic", fonts: ["DejaVuSans"], ms: 900 });
ok(/NOT AVAILABLE/.test(failLine) && /DejaVuSans/.test(failLine), "fail line names what was embedded instead");

// 5. The real check, when LibreOffice is installed here.
if (await findSoffice()) {
  const r = await checkLatoRendering();
  console.log(`  real check: ${latoCheckLine(r)}`);
  ok(r.ok, "LibreOffice here embeds Lato-Regular, Lato-Bold and Lato-Italic");
} else {
  console.log("  (LibreOffice not installed here: real check skipped)");
}

console.log(`document-fonts: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
