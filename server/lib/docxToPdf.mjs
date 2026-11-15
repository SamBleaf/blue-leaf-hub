// docxToPdf.mjs — the ONE local DOCX→PDF conversion (LibreOffice headless). Extracted from the fee-proposal
// generator (module5Routes) so the fee proposal and the Master Register documents convert identically;
// the only change is a private LibreOffice profile per call (safe under concurrent conversions). Templates use Lato,
// which ships with the app and is copied into that profile on every call (installProfileFonts below).
import { exec } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm, mkdir, copyFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const execP = promisify(exec);

// Lato, shipped with the app: server/fonts/lato holds the official Lato 2.015 Regular, Bold and Italic (SIL OFL 1.1;
// source and sha256 in its README). On Linux, LibreOffice adds "<user profile>/user/fonts" to fontconfig as an
// application font directory when it starts (vcl psp::getFontPath → FcConfigAppFontAddDir), on top of whatever
// fontconfig setup the runtime has. So copying the files into each call's private profile is all Railway needs: no
// system font, no fontconfig file, nothing that depends on the Nix wrapper. macOS LibreOffice uses CoreText and the
// installed Lato (the same files); the copy is harmless there.
export const BUNDLED_FONT_DIR = fileURLToPath(new URL("../fonts/lato/", import.meta.url));

export async function installProfileFonts(profileDir, fontDir = BUNDLED_FONT_DIR) {
  try {
    const files = (await readdir(fontDir)).filter((f) => /\.ttf$/i.test(f)).sort();
    const dest = join(profileDir, "user", "fonts");
    await mkdir(dest, { recursive: true });
    for (const f of files) await copyFile(join(fontDir, f), join(dest, f));
    return files;
  } catch (e) {
    // Best effort: the conversion still runs, and a PDF without Lato is caught by the document font check.
    console.warn(`[document-fonts] bundled fonts not copied into the LibreOffice profile: ${e?.message}`);
    return [];
  }
}

// Candidate soffice paths in priority order
const SOFFICE_CANDIDATES = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
  "soffice"
];

export async function findSoffice() {
  for (const bin of SOFFICE_CANDIDATES) {
    try {
      await execP(`"${bin}" --version`);
      return bin;
    } catch {
      // not found, try next
    }
  }
  return null;
}

export async function convertDocxToPdfBuffer(docxBuffer) {
  const soffice = await findSoffice();
  if (!soffice) {
    throw new Error(
      "LibreOffice is not installed. Install it with: brew install --cask libreoffice (macOS) or apt install libreoffice (Linux)"
    );
  }
  const dir = await mkdtemp(join(tmpdir(), "blb-pdf-"));
  const docxPath = join(dir, "proposal.docx");
  try {
    await writeFile(docxPath, docxBuffer);
    await installProfileFonts(join(dir, "lo-profile"));
    // A private user profile per call: concurrent conversions never fight over one LibreOffice profile lock.
    await execP(`"${soffice}" -env:UserInstallation=file://${join(dir, "lo-profile")} --headless --convert-to pdf --outdir "${dir}" "${docxPath}"`);
    const pdfPath = join(dir, "proposal.pdf");
    const pdfBuffer = await readFile(pdfPath);
    return pdfBuffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The fonts a PDF embeds, by name, without the subset prefix ("BAAAAA+Lato-Regular" → "Lato-Regular"). Read from the
 * PDF's font dictionaries, so it needs no extra tools on the server. Used to refuse a controlled document whose fonts
 * were silently substituted (e.g. a server without Lato installed).
 */
export function pdfFontNames(pdfBuffer) {
  const text = Buffer.from(pdfBuffer).toString("latin1");
  return [...new Set([...text.matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([A-Za-z0-9_.-]+)/g)].map((m) => m[1]))];
}

