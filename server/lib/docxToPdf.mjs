// docxToPdf.mjs — the ONE local DOCX→PDF conversion (LibreOffice headless). Extracted from the fee-proposal
// generator (module5Routes) so the fee proposal and the Master Register documents convert identically;
// the only change is a private LibreOffice profile per call (safe under concurrent conversions). Templates use Lato — the runtime must have it installed (see scripts/documents/README.md).
import { exec } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execP = promisify(exec);

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
    // A private user profile per call: concurrent conversions never fight over one LibreOffice profile lock.
    await execP(`"${soffice}" -env:UserInstallation=file://${join(dir, "lo-profile")} --headless --convert-to pdf --outdir "${dir}" "${docxPath}"`);
    const pdfPath = join(dir, "proposal.pdf");
    const pdfBuffer = await readFile(pdfPath);
    return pdfBuffer;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
