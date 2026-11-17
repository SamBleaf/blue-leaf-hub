# Lato (bundled for PDF conversion)

The document templates are set in Lato. These files ship with the app so the server's LibreOffice can print Lato without a system font install. Railway's Nix LibreOffice has no Lato and substitutes another font.

| File | sha256 |
|---|---|
| Lato-Regular.ttf | `6f6940be0835c3ddec9199e5fc42be4cbc61ebcfd58c623fdf719366253f1780` |
| Lato-Bold.ttf | `bf1b8130069b44b9148eeece35e5423bedac49777ba746615b826b8276574a7b` |
| Lato-Italic.ttf | `8c863f833b12bc8486671d26e3a58b13b0f9eaff1d6b10398e7c107a9b7ee05a` |
| OFL.txt | `bac163b7ef3044511d80804165ff7ca3df6677da83ed32f21fa6c17041d6fa28` |

- **Source.** The official Lato 2.0 desktop release, `Lato2OFL.zip` (version 2.015, 6 Aug 2015) from the designer's site, https://www.latofonts.com/files/Lato2OFL.zip. Downloaded 16 Nov 2026; the zip's sha256 was `42b54e96c07e299d967fc3227c7bd63a20d6cfb1dc8fd6dae83628091e20a5b8`. Only Regular, Bold and Italic are kept, because those are the only styles the templates use.
- **Same files as the design work.** These are byte-identical to the Lato installed on the owner's Mac, where the approved local renders were made, so Railway lays out text exactly as those renders do.
- **Licence.** SIL Open Font License 1.1 (`OFL.txt`, unchanged). Bundling and redistributing the fonts with software is allowed. The fonts can't be sold on their own, and a modified version can't be called "Lato".
- **Check the files.** Run `shasum -a 256 -c SHA256SUMS` in this folder. `node scripts/tests/document-fonts.test.mjs` checks them too.

**How they're used.** `server/lib/docxToPdf.mjs` copies the TTFs into each conversion's private LibreOffice profile, at `<profile>/user/fonts`. On Linux, LibreOffice adds that folder to fontconfig as application fonts when it starts, on top of whatever fontconfig setup the machine has. On macOS, LibreOffice uses CoreText and the installed Lato.

**Checking a server.** Run `node scripts/documents/check-lato.mjs`, or read the API's `[document-fonts]` line in the boot log.
