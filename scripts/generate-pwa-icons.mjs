#!/usr/bin/env node
/**
 * generate-pwa-icons.mjs — produce the square PNG app icons for both installable identities
 * (Worker PWA /manifest.json and Hub /manifest.webmanifest) from the brand square master.
 *
 * Source: public/brand/social-icon-blue.jpg (1601x1601, white BLB leaf on brand blue #006c9b,
 * centred with generous margin → safe for BOTH "any" and "maskable" purposes without extra padding).
 *
 * Output (public/icons/):
 *   icon-192.png, icon-512.png   — manifest icons (purpose "any maskable")
 *   apple-touch-icon.png (180)   — iOS Add-to-Home-Screen icon
 *
 * Uses macOS `sips` (no npm deps). Re-run after the brand master changes. Commit the PNGs so the
 * Vercel build does not need sips. iOS ignores SVG icons, hence raster PNGs are required.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "public/brand/social-icon-blue.jpg");
const OUT = path.join(ROOT, "public/icons");
mkdirSync(OUT, { recursive: true });

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of targets) {
  const out = path.join(OUT, name);
  execFileSync("sips", ["-s", "format", "png", "-z", String(size), String(size), SRC, "--out", out], { stdio: "ignore" });
  const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", out]).toString().trim().split("\n").slice(1).join(" ");
  console.log(`✓ ${name.padEnd(22)} ${dims.replace(/\s+/g, " ")}`);
}
console.log("Done. Commit public/icons/*.png.");
