#!/usr/bin/env node
/**
 * scripts/upload-branding.mjs
 * One-off script: reads brand assets from public/brand/ and uploads them
 * to Supabase Storage (bucket: "branding") via the service role key.
 *
 * Run: node scripts/upload-branding.mjs
 * Or:  npm run upload:branding
 */

import { readFile } from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import { config as dotenvConfig } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

dotenvConfig({ path: join(ROOT, ".env"), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BUCKET = "branding";

// Assets to upload: [localPath, storageName, contentType]
const ASSETS = [
  ["public/brand/BLB_Icon_Blue.png",          "BLB_Icon_Blue.png",          "image/png"],
  ["public/brand/BLB_Icon_Blue.svg",          "BLB_Icon_Blue.svg",          "image/svg+xml"],
  ["public/brand/BLB_Icon_White.png",         "BLB_Icon_White.png",         "image/png"],
  ["public/brand/BLB_Icon_White.svg",         "BLB_Icon_White.svg",         "image/svg+xml"],
  ["public/brand/BLB_Primary_Logo_White.png", "BLB_Primary_Logo_White.png", "image/png"],
  ["public/brand/BLB_Primary_Logo_White.svg", "BLB_Primary_Logo_White.svg", "image/svg+xml"],
  ["public/brand/blb-logo-primary-white.png", "blb-logo-primary-white.png", "image/png"],
  ["public/brand/blb-leaf-icon.png",          "blb-leaf-icon.png",          "image/png"],
];

async function ensureBucket() {
  // Always attempt creation; ignore "already exists" errors
  const { error: createErr } = await sb.storage.createBucket(BUCKET, { public: false });
  if (createErr) {
    if (createErr.message?.toLowerCase().includes("already exist") ||
        createErr.message?.toLowerCase().includes("duplicate")) {
      console.log(`  Bucket "${BUCKET}" already exists.`);
    } else {
      throw new Error(`Failed to create bucket: ${createErr.message}`);
    }
  } else {
    console.log(`  Created bucket "${BUCKET}".`);
  }
}

async function uploadAsset(localPath, storageName, contentType) {
  const fullPath = join(ROOT, localPath);
  let buf;
  try {
    buf = await readFile(fullPath);
  } catch {
    console.warn(`  ⚠️  Skipped ${storageName} — file not found at ${localPath}`);
    return;
  }
  const { error } = await sb.storage.from(BUCKET).upload(storageName, buf, { contentType, upsert: true });
  if (error) {
    console.error(`  ❌  ${storageName}: ${error.message}`);
  } else {
    console.log(`  ✅  ${storageName} (${buf.length.toLocaleString()} bytes)`);
  }
}

async function main() {
  console.log(`\nUploading BLB brand assets to Supabase Storage bucket "${BUCKET}"...\n`);
  await ensureBucket();
  for (const [localPath, storageName, contentType] of ASSETS) {
    await uploadAsset(localPath, storageName, contentType);
  }
  console.log("\nDone. Brand assets are now available server-side for email signatures and PDFs.\n");
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exit(1);
});
