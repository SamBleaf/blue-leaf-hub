# Lato on Railway: owner note

Branch `release/lato-railway`, off `main` 88dc0ea. Local commits only: nothing pushed, deployed or changed in Railway.

## Why

Register documents (Client Project Brief and the others) are set in Lato. Railway's LibreOffice comes from Nix with no fonts of its own, so PDFs printed in a substitute font. Once the document suite is merged, its font check refuses any preview or issue whose PDF has no Lato. That's why Lato on Railway is a release gate.

## What changed

1. **Lato ships with the app.** `server/fonts/lato/` holds the official Lato 2.015 Regular, Bold and Italic, plus the SIL OFL 1.1 licence (`OFL.txt`). The files come from the designer's release, `Lato2OFL.zip` from latofonts.com. They are byte-identical to the Lato on your Mac that the approved local renders used. Source and sha256 are in that folder's README and `SHA256SUMS`.
2. **Each conversion gets the fonts.** `server/lib/docxToPdf.mjs` already gives every conversion a private LibreOffice profile. It now copies the three fonts into `<profile>/user/fonts` first.
   - **Why this is reliable.** LibreOffice on Linux always adds that folder to its fonts at startup, whatever the server's font setup. This is in LibreOffice's own code, checked in the 7.4 source that Railway's Nix uses and in current releases.
   - **No dependence on the Nix setup.** It needs no system font, no fontconfig file, and nothing from the Nix wrapper (which sets no font config at that version anyway). Nothing in `nixpacks.toml` or `railway.toml` changed.
   - **If the copy fails.** It logs a warning and the conversion still runs.
   - **macOS.** Behaviour is unchanged.
3. **A diagnostic.**
   - **Boot log.** 20 seconds after the API boots on Railway, it converts a three-line test document (Lato Regular, Bold, Italic) and logs one line, either `[document-fonts] Lato OK: LibreOffice embeds Lato-Bold, Lato-Italic, Lato-Regular (… ms)` or `[document-fonts] Lato NOT AVAILABLE: …` naming what it embedded instead.
   - **Same check by hand.** `node scripts/documents/check-lato.mjs` (exit code 0 = OK).
   - **What it logs.** Font names and timing only.
   - **Switch.** It's off in local dev. `DOCUMENT_FONT_SELFTEST=true` runs it anywhere and `=false` turns it off on Railway.
4. **Tests.** `node scripts/tests/document-fonts.test.mjs` runs 18 checks: file hashes, the copy, a missing font folder, the test document and the log line.

## How it was verified, and what wasn't

- **On this Mac.**
  - The checksums match the official release.
  - The 18 tests pass.
  - The real check passes.
  - The negative control works: a document asking for a font that doesn't exist came out in LinuxLibertineG, and the check named all three Lato faces as missing.
- **Merged with `doc-suite-r01`** in a throwaway copy:
  - It merges with no conflicts.
  - The five fictional specimens render with identical pages, fonts, text and page images before and after: 18 of 18 page images are byte-identical.
  - `documents-cpb` (136 checks), `documents-r01` (17) and `register-documents-structured` (59) all pass.
- **Not verified on Linux.**
  - This Mac has no Docker, Podman, Colima or Nix, so no Linux container could be run.
  - Mac LibreOffice uses CoreText, so the local checks prove the code path and that nothing regressed. They don't prove Railway.
  - The Linux behaviour rests on LibreOffice's source. Confirm it with the staging check below before relying on it.

## Staging check (before production)

Use a Railway environment that isn't production, with **no production variables**. The API boots without them, and the font check needs no database, mail or secrets. A copy of production's variables would start the inbox poller and the nightly jobs against live services, so don't duplicate production.

1. Push `release/lato-railway` to GitHub (yours to do).
2. In Railway, create an empty environment (for example `font-check`). Add the API service from the repo on branch `release/lato-railway`, and add no variables. `railway.toml` and `nixpacks.toml` supply the build and start commands.
3. When it's running, open the deployment logs. About 20 s after `[blue-leaf-api] Listening on …`, look for:
   `[document-fonts] Lato OK: LibreOffice embeds Lato-Bold, Lato-Italic, Lato-Regular (… ms)`
   If no `[document-fonts]` line appears at all, add the one variable `DOCUMENT_FONT_SELFTEST=true` and redeploy. The check runs by default only where Railway provides its environment name.
4. Optional: open a shell in the running service (`railway ssh` in a current Railway CLI) and run `node scripts/documents/check-lato.mjs --json`. The `fonts` list should be exactly Lato-Bold, Lato-Italic and Lato-Regular.
5. Delete the environment.

If step 3 says `NOT AVAILABLE`, stop: don't deploy to production. Send the line, which names the fonts it used instead.

## Production

1. **Merge.** Merge `release/lato-railway` to `main`, ahead of or with the document suite.
2. **Check the boot log.** After Railway deploys, the logs should show `[document-fonts] Lato OK …` about 20 s after boot.
3. **Check one preview, once the document suite is live.** Render one register document preview, for example the Client Project Brief on a pilot lead. It should not be refused for font substitution. Download the PDF and run `pdffonts brief.pdf` on the Mac. Expect Lato-Regular, Lato-Bold and Lato-Italic (each with a six-letter subset prefix) and no serif. A short brief may use only Regular and Bold.
4. **Before the suite is live,** the boot line is the check. The fee proposal's local PDF path also uses this conversion, but it uploads to Dropbox, so don't use it as a test.

## Rollback

- **Code.** Revert the commit (`git revert <sha>` on `main`) and redeploy, or redeploy the previous deployment in Railway. Nothing touches the database, and no settings changed.
- **If the boot check is ever a nuisance** (it starts LibreOffice once per boot), set `DOCUMENT_FONT_SELFTEST=false`. Conversions keep their fonts.
- **Emergency only.** With the document suite live, `DOCUMENT_FONT_CHECK=warn` lets substituted PDFs through with a warning.

## After staging passes

`docs/documents/DOCUMENT_SUITE.md` is on `doc-suite-r01`, not `main`, and the fix isn't verified on Linux yet, so its release-gate line hasn't been changed. Once the staging check passes, replace the "Railway has no Lato: release gate" bullet and its sub-bullets with:

> - **Lato on Railway: resolved (`release/lato-railway`).** The app ships Lato 2.015 in `server/fonts/lato` and copies it into each conversion's LibreOffice profile. Staging boot log showed `[document-fonts] Lato OK` on <date>. Post-deploy check: the boot log line, then one preview's `pdffonts`.
