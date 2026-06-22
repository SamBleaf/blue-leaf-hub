const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT = "https://content.dropboxapi.com/2";

/** Team/client-visible tender tree (team folder → PROJECTS/BLUE LEAF BUILDING). */
export const DROPBOX_SHARED_PROJECTS_BASE = "/BLUE LEAF BUILDING/PROJECTS/BLUE LEAF BUILDING";

/** Private INTERNAL tree (team folder → INTERNAL; see restrictInternalFolder…). */
export const DROPBOX_PRIVATE_INTERNAL_BASE = "/BLUE LEAF BUILDING/INTERNAL";

/** Documents & Templates registry tree — editable masters, organised per software module. */
export const DROPBOX_TEMPLATES_BASE = "/BLUE LEAF BUILDING/ADMINISTRATION/TEMPLATES";

const QUOTES = "QUOTES";

function dropboxEnv() {
  const key = process.env.DROPBOX_APP_KEY?.trim();
  const secret = process.env.DROPBOX_APP_SECRET?.trim();
  const refresh = process.env.DROPBOX_REFRESH_TOKEN?.trim();
  if (!key || !secret || !refresh) return null;
  return { key, secret, refresh };
}

export function dropboxConfigured() {
  return Boolean(dropboxEnv());
}

let _accessToken = null;
let _accessExpiry = 0;

export async function getDropboxAccessToken() {
  const env = dropboxEnv();
  if (!env) throw new Error("Dropbox is not configured (DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN).");
  const now = Date.now();
  if (_accessToken && now < _accessExpiry - 60_000) return _accessToken;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: env.refresh,
    client_id: env.key,
    client_secret: env.secret
  });
  const res = await fetch(DROPBOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `Dropbox token refresh failed (${res.status})`);
  }
  _accessToken = json.access_token;
  _accessExpiry = now + (json.expires_in || 14400) * 1000;
  return _accessToken;
}

let _teamNamespaceId = null;
let _teamNamespaceIdPromise = null;

function buildDropboxApiPathRootHeader(namespaceId) {
  if (!namespaceId || typeof namespaceId !== "string") {
    throw new Error("Dropbox namespace id is missing — set DROPBOX_NAMESPACE_ID or fix users/get_current_account.");
  }
  return JSON.stringify({ ".tag": "namespace_id", namespace_id: namespaceId });
}

/** Manual override: team root namespace id when API discovery is not used. */
function getDropboxNamespaceIdFromEnv() {
  const v = process.env.DROPBOX_NAMESPACE_ID;
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

/**
 * `users/get_current_account` — no Path-Root header (avoids circular dependency with {@link getTeamNamespaceId}).
 */
async function rpcGetCurrentAccountNoPathRoot(accessToken) {
  const res = await fetch(`${DROPBOX_API}/users/get_current_account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json.error_summary || json.error || text || `Dropbox API users/get_current_account failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

/**
 * Team / root namespace id for `Dropbox-API-Path-Root` (cached per process).
 * Uses `DROPBOX_NAMESPACE_ID` when set; otherwise `users/get_current_account` → `root_info.root_namespace_id`
 * (requires `account_info.read` on the Dropbox app).
 */
export async function getTeamNamespaceId(accessToken) {
  const fromEnv = getDropboxNamespaceIdFromEnv();
  if (fromEnv) {
    _teamNamespaceId = fromEnv;
    return fromEnv;
  }
  if (_teamNamespaceId) return _teamNamespaceId;
  if (!_teamNamespaceIdPromise) {
    _teamNamespaceIdPromise = (async () => {
      const account = await rpcGetCurrentAccountNoPathRoot(accessToken);
      const id = account?.root_info?.root_namespace_id;
      if (!id || typeof id !== "string") {
        throw new Error(
          "Dropbox root namespace id not found (root_info.root_namespace_id). Set DROPBOX_NAMESPACE_ID in .env " +
            "or add the account_info.read scope to the Dropbox app and re-run `npm run auth:dropbox`."
        );
      }
      _teamNamespaceId = id;
      return id;
    })();
  }
  try {
    return await _teamNamespaceIdPromise;
  } catch (err) {
    _teamNamespaceIdPromise = null;
    throw err;
  }
}

async function rpc(path, arg, accessToken) {
  const namespaceId = await getTeamNamespaceId(accessToken);
  const res = await fetch(`${DROPBOX_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Dropbox-API-Path-Root": buildDropboxApiPathRootHeader(namespaceId)
    },
    body: JSON.stringify(arg ?? {})
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const summary = json?.error_summary != null ? String(json.error_summary) : "";
    const errPart =
      json?.error == null
        ? ""
        : typeof json.error === "string"
          ? json.error
          : JSON.stringify(json.error);
    const msg =
      [summary, errPart].filter(Boolean).join(" ") ||
      text ||
      `Dropbox API ${path} failed (${res.status})`;
    const err = new Error(msg);
    err.dropboxResponse = json;
    throw err;
  }
  return json;
}

/** Comma- or newline-separated Dropbox login emails for private INTERNAL job roots. */
export function parseInternalViewerEmails() {
  const raw = process.env.DROPBOX_INTERNAL_VIEWER_EMAILS?.trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    )
  ];
}

async function sharingPost(endpoint, body, accessToken) {
  const namespaceId = await getTeamNamespaceId(accessToken);
  const res = await fetch(`${DROPBOX_API}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Dropbox-API-Path-Root": buildDropboxApiPathRootHeader(namespaceId)
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

function sharedFolderIdFromShareFolderResponse(json) {
  if (!json || typeof json !== "object") return null;
  if (json[".tag"] === "complete" && json.complete?.shared_folder_id) return json.complete.shared_folder_id;
  if (json[".tag"] === "complete" && json.shared_folder_id) return json.shared_folder_id;
  if (json.shared_folder_id) return json.shared_folder_id;
  return null;
}

function sharedFolderIdFromShareFolderError(json) {
  const err = json?.error;
  if (!err || typeof err !== "object") return null;
  if (err[".tag"] === "shared_folder_already_exists") {
    return err.shared_folder_already_exists?.shared_folder_id || null;
  }
  return null;
}

async function pollShareJobUntilComplete(accessToken, asyncJobId) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const { ok, json } = await sharingPost(
      "sharing/check_share_job_status",
      { async_job_id: asyncJobId },
      accessToken
    );
    if (!ok) continue;
    const tag = json[".tag"];
    if (tag === "complete" && json.complete?.shared_folder_id) return json.complete.shared_folder_id;
    if (tag === "failed") {
      const reason = json.failed?.error || json.failed || "share job failed";
      throw new Error(typeof reason === "string" ? reason : JSON.stringify(reason));
    }
  }
  throw new Error("Dropbox share_folder async job timed out.");
}

async function resolveSharedFolderIdForPrivateJobRoot(accessToken, privateJobRootPath) {
  let meta;
  try {
    meta = await rpc(
      "files/get_metadata",
      {
        path: privateJobRootPath,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: true
      },
      accessToken
    );
  } catch (e) {
    const msg = e?.message || String(e);
    if (/not_found/i.test(msg)) {
      throw new Error(`Private job path not found yet: ${privateJobRootPath}`);
    }
    throw e;
  }
  const existing = meta.sharing_info?.shared_folder_id;
  if (existing) return existing;

  let { ok, json } = await sharingPost(
    "sharing/share_folder",
    { path: privateJobRootPath, access_inheritance: "no_inherit", force_async: false },
    accessToken
  );
  let id = ok ? sharedFolderIdFromShareFolderResponse(json) : null;
  if (ok && json?.async_job_id && !id) {
    id = await pollShareJobUntilComplete(accessToken, json.async_job_id);
  }
  if (id) return id;

  const fromErr = sharedFolderIdFromShareFolderError(json);
  if (fromErr) return fromErr;

  ({ ok, json } = await sharingPost(
    "sharing/share_folder",
    { path: privateJobRootPath, force_async: false },
    accessToken
  ));
  id = ok ? sharedFolderIdFromShareFolderResponse(json) : null;
  if (ok && json?.async_job_id && !id) {
    id = await pollShareJobUntilComplete(accessToken, json.async_job_id);
  }
  if (id) return id;
  const fromErr2 = sharedFolderIdFromShareFolderError(json);
  if (fromErr2) return fromErr2;

  throw new Error(json?.error_summary || JSON.stringify(json?.error) || "sharing/share_folder failed");
}

/**
 * Restrict the **private** job root `…/BLUE LEAF BUILDING/INTERNAL/[JOB-SEGMENT]` so only configured viewer emails have access.
 * (Shared PROJECTS tree is not passed here.)
 */
export async function restrictInternalFolderToConfiguredViewers(jobAddress) {
  const emails = parseInternalViewerEmails();
  if (!emails.length) {
    return { skipped: true, reason: "DROPBOX_INTERNAL_VIEWER_EMAILS not set" };
  }

  const token = await getDropboxAccessToken();
  const privateRoot = privateInternalJobRootPath(jobAddress);
  const sharedFolderId = await resolveSharedFolderIdForPrivateJobRoot(token, privateRoot);

  const inheritance = await sharingPost(
    "sharing/set_access_inheritance",
    { shared_folder_id: sharedFolderId, access_inheritance: "no_inherit" },
    token
  );
  const inheritanceError = inheritance.ok
    ? null
    : inheritance.json?.error_summary || inheritance.json?.error || `http_${inheritance.status}`;

  const memberResults = [];
  for (const email of emails) {
    const add = await sharingPost(
      "sharing/add_folder_member",
      {
        shared_folder_id: sharedFolderId,
        members: [
          {
            member: { ".tag": "email", email },
            access_level: { ".tag": "viewer" }
          }
        ],
        quiet: true
      },
      token
    );
    if (add.ok) {
      memberResults.push({ email, ok: true });
      continue;
    }
    const summary = add.json?.error_summary || JSON.stringify(add.json?.error || add.json);
    if (/already_a_member|same_member|already invited/i.test(summary)) {
      memberResults.push({ email, ok: true, note: "already_member" });
      continue;
    }
    memberResults.push({ email, ok: false, error: summary });
  }

  return {
    ok: memberResults.every((m) => m.ok),
    internalPath: privateRoot,
    shared_folder_id: sharedFolderId,
    inheritance_applied: inheritance.ok,
    inheritance_error: inheritanceError,
    members: memberResults
  };
}

/** Job folder segment: UPPERCASE, strip specials, spaces → hyphens, max 60 (legacy INTERNAL / quote paths). */
export function sanitizeJobAddressPathSegment(address) {
  return (
    String(address || "UNSPECIFIED-JOB")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "UNSPECIFIED-JOB"
  );
}

/**
 * Job folder name under PROJECTS (template copy destination):
 * uppercase, spaces + commas preserved, no hyphens, specials stripped, max 60 chars.
 */
export function sanitizeJobFolderDisplayName(address) {
  let s = String(address || "")
    .replace(/[^A-Za-z0-9 ,]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!s) s = "UNSPECIFIED JOB";
  if (s.length > 60) s = s.slice(0, 60).replace(/[\s,]+$/, "");
  return s || "UNSPECIFIED JOB";
}

/** Trade / business segments for paths & filenames — hyphens, uppercase. */
export function sanitizeTradeOrBusinessSegment(s, maxLen = 80) {
  return (
    String(s || "UNKNOWN")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, maxLen) || "UNKNOWN"
  );
}

export function sharedJobRootPath(jobAddress) {
  const seg = sanitizeJobFolderDisplayName(jobAddress);
  return `${DROPBOX_SHARED_PROJECTS_BASE}/${seg}`;
}

export function privateInternalJobRootPath(jobAddress) {
  const seg = sanitizeJobAddressPathSegment(jobAddress);
  return `${DROPBOX_PRIVATE_INTERNAL_BASE}/${seg}`;
}

/**
 * Filename-only routing under duplicated job folder (no documentCategory).
 * @returns {string[]} path segments under job root, e.g. ["ARCHITECTURAL"] or ["INTERNAL","PRESALE DOCS"]
 */
export function classifyTenderUploadSegments(fileName, hints = "") {
  const n = `${fileName} ${hints}`.toLowerCase();
  // Only match on explicit keywords — no broad guesses
  if (/\benergy\b|\bnathers\b|\bnat\s*hers\b|\bbess\b|\bthermal\b/.test(n)) {
    return ["PLANS", "ENERGY REPORT"];
  }
  if (/\bstructural\b|\bengineering\b|\bgeotech\b|\bfooting\b|\bfooting\s*plan\b/.test(n)) {
    return ["PLANS", "ENGINEERING"];
  }
  if (/\bselections\b|\bjoinery\b|\bcabinet\b|\binteriors\b/.test(n)) {
    return ["PLANS", "INTERIORS, SELECTIONS, CABINTRY"];
  }
  if (/\bsurvey\b|\bcontour\b|\bfeature\s*survey\b/.test(n)) {
    return ["PLANS", "SURVEY"];
  }
  if (/\btimber\s*frame\b|\bwall\s*frame\b|\broof\s*truss\b|\btruss\b/.test(n)) {
    return ["PLANS", "TIMBER FRAMING"];
  }
  if (/\barchitectural\b|\barchitect\b|\bfloor\s*plan\b|\belevation\b|\bworking\s*drawing\b/.test(n)) {
    return ["PLANS", "ARCHITECTURAL"];
  }
  // No confident match — leave for user to assign via doc type dropdown
  return ["INTERNAL", "PRESALE DOCS"];
}

function sanitizeOriginalPdfFileNameUpper(fileName) {
  const raw = String(fileName || "DOCUMENT.PDF");
  const hasPdf = /\.pdf$/i.test(raw);
  const base = hasPdf ? raw.replace(/\.pdf$/i, "") : raw;
  const stem =
    base
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "DOCUMENT";
  return `${stem}.PDF`;
}

/** `[TRADE]-[BUSINESSNAME].txt` (uppercase stem, spaces as hyphens) */
export function buildRfqEmailTxtFileName(trade, businessName) {
  const t = sanitizeTradeOrBusinessSegment(trade, 50);
  const b = sanitizeTradeOrBusinessSegment(businessName, 50);
  return `${t}-${b}.txt`;
}

/** `[TRADE]-[BUSINESSNAME]-QUOTE.PDF` */
export function buildStandardQuotePdfFileName(trade, businessName) {
  const t = sanitizeTradeOrBusinessSegment(trade, 40);
  const b = sanitizeTradeOrBusinessSegment(businessName, 40);
  return `${t}-${b}-QUOTE.PDF`;
}

export async function pathExists(accessToken, dropboxPath) {
  try {
    await rpc("files/get_metadata", { path: dropboxPath }, accessToken);
    return true;
  } catch (e) {
    if (/not_found/i.test(e?.message || "")) return false;
    throw e;
  }
}

/**
 * List all entries under a folder, following Dropbox pagination (`list_folder` + `list_folder/continue`).
 * @param {string} accessToken
 * @param {string} folderPath — Dropbox path (e.g. `/Photos`); use `""` for namespace root.
 * @param {{ recursive?: boolean }} [opts]
 * @returns {Promise<object[]>} all `entries` across pages
 */
export async function listFolderAllEntries(accessToken, folderPath, { recursive = false } = {}) {
  const path =
    folderPath === undefined || folderPath === null
      ? ""
      : String(folderPath) === "/"
        ? ""
        : String(folderPath);
  let page = await rpc("files/list_folder", { path, recursive }, accessToken);
  const entries = [...(page.entries || [])];
  while (page.has_more) {
    if (!page.cursor) break;
    page = await rpc("files/list_folder/continue", { cursor: page.cursor }, accessToken);
    entries.push(...(page.entries || []));
  }
  return entries;
}

export async function getOrCreateSharedLinkForPath(accessToken, path) {
  const attempts = [
    { path, settings: { requested_visibility: { ".tag": "team_only" } } },
    { path }
  ];
  for (const body of attempts) {
    const { ok, json } = await sharingPost("sharing/create_shared_link_with_settings", body, accessToken);
    if (ok && json.url) return json.url;
    const err = json?.error;
    if (err?.[".tag"] === "shared_link_already_exists") {
      const u =
        err.shared_link_already_exists?.metadata?.url ||
        err.shared_link_already_exists?.url ||
        err.shared_link_already_exists?.metadata?.path_lower;
      if (typeof u === "string" && u.startsWith("http")) return u;
    }
  }

  const listed = await rpc("sharing/list_shared_links", { path, direct_only: true }, accessToken).catch(() => null);
  const first = listed?.links?.[0];
  if (first?.url) return first.url;

  throw new Error("Could not create or resolve a Dropbox shared link for the shared job folder.");
}

/** Plan folders (client/subcontractor-shareable) that live under PLANS/. INTERNAL is never here. */
export const PLAN_FOLDER_NAMES = [
  "ARCHITECTURAL",
  "ENGINEERING",
  "SURVEY",
  "ENERGY REPORT",
  "TIMBER FRAMING",
  "INTERIORS, SELECTIONS, CABINTRY"
];

/**
 * Create (or upgrade an existing link to) a PUBLIC "anyone with the link" shared link on `path`.
 * Team policy must permit public links (verified). Used ONLY for the PLANS folder — never INTERNAL.
 */
export async function ensurePublicSharedLink(accessToken, path) {
  const publicSettings = { audience: { ".tag": "public" }, access: { ".tag": "viewer" }, allow_download: true };
  const created = await sharingPost(
    "sharing/create_shared_link_with_settings",
    { path, settings: publicSettings },
    accessToken
  );
  if (created.ok && created.json.url) return created.json.url;

  // A link already exists — resolve it, then force its audience to public.
  let url = null;
  if (created.json?.error?.[".tag"] === "shared_link_already_exists") {
    url =
      created.json.error.shared_link_already_exists?.metadata?.url ||
      created.json.error.shared_link_already_exists?.url ||
      null;
  }
  if (!url) {
    const listed = await sharingPost("sharing/list_shared_links", { path, direct_only: true }, accessToken);
    url = listed.json?.links?.[0]?.url || null;
  }
  if (!url) throw new Error(`Could not create or resolve a public Dropbox link for ${path}.`);
  await sharingPost(
    "sharing/modify_shared_link_settings",
    { url, settings: publicSettings, remove_expiration: false },
    accessToken
  ).catch(() => null);
  return url;
}

/**
 * Nest plan folders under `${sharedRoot}/PLANS` and return a PUBLIC link on PLANS. INTERNAL/* stays a
 * sibling the PLANS link cannot reach (a folder link only grants its own subtree). Idempotent — safe to
 * re-run; the root job folder is NOT publicly linked. Returns { plansRoot, plansLinkUrl, moved }.
 */
export async function ensurePlansSubfolderAndPublicLink(accessToken, sharedRoot) {
  const plansRoot = `${sharedRoot}/PLANS`;
  await createFolderIfNotExists(accessToken, plansRoot);

  let entries = [];
  try {
    entries = await listFolderAllEntries(accessToken, sharedRoot, { recursive: false });
  } catch {
    entries = [];
  }
  const moved = [];
  for (const e of entries) {
    if (e[".tag"] !== "folder") continue;
    const name = e.name;
    if (name === "PLANS" || name === "INTERNAL") continue;
    if (!PLAN_FOLDER_NAMES.includes(name)) continue; // only relocate known plan folders
    try {
      await rpc(
        "files/move_v2",
        { from_path: `${sharedRoot}/${name}`, to_path: `${plansRoot}/${name}`, autorename: false, allow_ownership_transfer: false },
        accessToken
      );
      moved.push(name);
    } catch (err) {
      if (!/conflict|already|duplicate/i.test(err?.message || "")) throw err;
    }
  }

  const plansLinkUrl = await ensurePublicSharedLink(accessToken, plansRoot);
  return { plansRoot, plansLinkUrl, moved };
}

/** Migrate an EXISTING job's folder to the PLANS-nesting layout + public link. */
export async function migrateJobToPlans(jobAddress) {
  const token = await getDropboxAccessToken();
  return ensurePlansSubfolderAndPublicLink(token, sharedJobRootPath(jobAddress));
}

export async function dropboxUploadBuffer(accessToken, dropboxPath, buffer, { autorename = true } = {}) {
  const arg = JSON.stringify({
    path: dropboxPath,
    mode: "add",
    autorename,
    mute: true
  });
  const namespaceId = await getTeamNamespaceId(accessToken);
  const res = await fetch(`${DROPBOX_CONTENT}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Path-Root": buildDropboxApiPathRootHeader(namespaceId),
      "Dropbox-API-Arg": arg,
      "Content-Type": "application/octet-stream"
    },
    body: buffer
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json.error_summary || json.error || text || `Dropbox upload failed (${res.status})`);
  }
  return json;
}

export async function dropboxUploadUtf8Text(accessToken, dropboxPath, utf8Text, { autorename = true } = {}) {
  const buf = Buffer.from(String(utf8Text || ""), "utf8");
  return dropboxUploadBuffer(accessToken, dropboxPath, buf, { autorename });
}

/**
 * Dropbox template source path from env — returned exactly as set in `DROPBOX_TEMPLATE_PATH`
 * (no trim or path normalisation) for use in `files/copy_v2` `from_path`.
 */
export function getDropboxTemplatePath() {
  const v = process.env.DROPBOX_TEMPLATE_PATH;
  if (v === undefined || v === null) return "";
  return String(v);
}

function tenderSegmentsFromDocumentCategory(category) {
  const c = String(category || "")
    .trim()
    .toLowerCase();
  const map = {
    architectural: ["PLANS", "ARCHITECTURAL"],
    engineering: ["PLANS", "ENGINEERING"],
    energy_report: ["PLANS", "ENERGY REPORT"],
    interiors_selections: ["PLANS", "INTERIORS, SELECTIONS, CABINTRY"],
    survey: ["PLANS", "SURVEY"],
    timber_framing: ["PLANS", "TIMBER FRAMING"],
    internal: ["INTERNAL", "PRESALE DOCS"],
    other: ["INTERNAL", "PRESALE DOCS"]
  };
  return map[c] || null;
}

/**
 * Duplicates DROPBOX_TEMPLATE_PATH into the job folder under PROJECTS, then resolves a team shared link.
 * Folder layout comes from the template (no per-folder create_folder loop).
 */
export async function ensureJobFolderStructure(opts) {
  const token = await getDropboxAccessToken();
  const templatePath = getDropboxTemplatePath();
  if (templatePath === "") {
    throw new Error(
      "DROPBOX_TEMPLATE_PATH is not set — add it to .env (path to the Dropbox “NEW JOB TEMPLATE” folder)."
    );
  }

  const sharedRoot = sharedJobRootPath(opts.jobAddress);

  try {
    await rpc(
      "files/copy_v2",
      {
        from_path: templatePath,
        to_path: sharedRoot,
        autorename: false,
        allow_shared_folder: false,
        allow_ownership_transfer: false
      },
      token
    );
  } catch (e) {
    const dErr = e?.dropboxResponse?.error;
    const tag =
      dErr?.[".tag"] ??
      dErr?.to?.[".tag"] ??
      e?.error?.error?.[".tag"] ??
      e?.error?.[".tag"] ??
      "";
    const msg = e?.message || JSON.stringify(e?.dropboxResponse || e?.error || e) || "";
    if (
      tag.includes("conflict") ||
      msg.includes("conflict") ||
      msg.includes("already_exists") ||
      msg.includes("duplicate")
    ) {
      /* folder already exists — idempotent, continue */
    } else {
      throw e;
    }
  }

  // Public "anyone with link" share on PLANS only — never the job root (which contains INTERNAL).
  const { plansRoot, plansLinkUrl } = await ensurePlansSubfolderAndPublicLink(token, sharedRoot);
  const dropboxSharedLinkUrl = plansLinkUrl;

  const privateRoot = `${sharedRoot}/INTERNAL`;

  // Expand the template's folder tree with the extra operational branches (LEAD DOCS,
  // SITE DIARY, SCHEDULE, WHS/INDUCTIONS, MARKETING, …). Log-only + never throws so a
  // hiccup here never blocks job-folder provisioning (Dropbox is a non-fatal mirror).
  try {
    await ensureExtendedJobFolders(opts.jobAddress);
  } catch (e) {
    console.warn("[ensureJobFolderStructure] extended folders skipped:", e?.message || e);
  }

  return {
    sharedRoot,
    plansRoot,
    privateRoot,
    dropboxSharedLinkUrl,
    createdPaths: [sharedRoot, plansRoot],
    internalShare: null
  };
}

/**
 * Ensure the expanded operational branches exist under the shared job root.
 * Sequential (no Promise.all), idempotent (createFolderIfNotExists swallows path/conflict),
 * and never throws — Dropbox is a non-fatal mirror. Parents are created before children
 * (e.g. INTERNAL before INTERNAL/LEAD DOCS, WHS before WHS/INDUCTIONS).
 */
export async function ensureExtendedJobFolders(jobAddress) {
  try {
    const token = await getDropboxAccessToken();
    const root = sharedJobRootPath(jobAddress);
    // Order matters: each parent must precede its children.
    const branches = [
      // Canonical INTERNAL records taxonomy — mirrors RECORD_FOLDERS in
      // jobRecordsFiler.mjs. Every job record (every module, end to end) is filed
      // under one of these so the job folder is a complete record-keeping archive.
      "INTERNAL",
      "INTERNAL/CONTRACT",
      "INTERNAL/APPROVED PLANS",
      "INTERNAL/PERMITS & APPROVALS",
      "INTERNAL/ENGINEERING & REPORTS",
      "INTERNAL/SELECTIONS",
      "INTERNAL/RFQ",
      "INTERNAL/QUOTES",
      "INTERNAL/P.O",
      "INTERNAL/VARIATIONS",
      "INTERNAL/PROGRESS CLAIMS",
      "INTERNAL/INVOICES",
      "INTERNAL/SITE DIARY",
      "INTERNAL/SITE PHOTOS",
      "INTERNAL/SCHEDULE",
      "INTERNAL/WHS",
      "INTERNAL/WHS/INDUCTIONS",
      "INTERNAL/CORRESPONDENCE",
      "INTERNAL/CERTIFICATES & HANDOVER",
      "INTERNAL/PRESALE DOCS",
      "INTERNAL/LEAD DOCS",
      "INTERNAL/PORTAL",
      // Legacy top-level branches kept for back-compat with not-yet-rewired modules
      // and existing jobs (records migrate under INTERNAL as each module adopts
      // jobRecordsFiler). MARKETING stays top-level (shareable assets, not records).
      "SITE DIARY",
      "SCHEDULE",
      "WHS",
      "WHS/INDUCTIONS",
      "MARKETING",
    ];
    for (const seg of branches) {
      try {
        await createFolderIfNotExists(token, `${root}/${seg}`);
      } catch (e) {
        // Swallow path/conflict and any per-folder error — keep going, never throw.
        console.warn(`[ensureExtendedJobFolders] ${seg} skipped:`, e?.message || e);
      }
    }
  } catch (e) {
    console.warn("[ensureExtendedJobFolders] skipped:", e?.message || e);
  }
}

/**
 * Backfill a lead's documents, notes, and conversations into the job's
 * `INTERNAL/LEAD DOCS/` Dropbox folder. Idempotent (skips files that already exist),
 * non-fatal (Dropbox is a mirror), and SEQUENTIAL (no Promise.all — concurrent reads
 * fail for online-only Smart Sync files; see CLAUDE.md).
 *
 * Each lead_documents row is downloaded from the 'lead-documents' Supabase bucket and
 * uploaded to INTERNAL/LEAD DOCS/<original-filename>. lead_notes and lead_conversations
 * are dumped to LEAD-NOTES.txt / LEAD-CONVERSATIONS.txt. Every file is wrapped in its
 * own try/catch so one failure never aborts the rest.
 *
 * @param {{ sb: object, leadId: string, jobAddress: string }} args
 * @returns {Promise<{ copied: number, failed: number }>}
 */
export async function backfillLeadDataToJobFolder({ sb, leadId, jobAddress }) {
  let copied = 0;
  let failed = 0;
  if (!sb || !leadId || !jobAddress) return { copied, failed };

  let token;
  let leadDocsRoot;
  try {
    token = await getDropboxAccessToken();
    const root = sharedJobRootPath(jobAddress);
    leadDocsRoot = `${root}/INTERNAL/LEAD DOCS`;
    // files/upload auto-creates parents, but ensure the folder exists for the text dumps too.
    await createFolderIfNotExists(token, `${root}/INTERNAL`);
    await createFolderIfNotExists(token, leadDocsRoot);
  } catch (e) {
    console.warn("[backfillLeadDataToJobFolder] setup skipped:", e?.message || e);
    return { copied, failed };
  }

  // 1. Lead documents from the 'lead-documents' Supabase bucket → INTERNAL/LEAD DOCS/<filename>.
  try {
    const { data: docs } = await sb
      .from("lead_documents")
      .select("filename, storage_path")
      .eq("lead_id", leadId);
    for (const doc of docs || []) {
      const fileName = String(doc.filename || "").trim() || "document";
      const destPath = `${leadDocsRoot}/${fileName}`;
      try {
        if (await pathExists(token, destPath)) continue; // idempotent — already backfilled
        const { data: blob, error: dlErr } = await sb.storage
          .from("lead-documents")
          .download(doc.storage_path);
        if (dlErr || !blob) {
          failed += 1;
          console.warn(`[backfillLeadDataToJobFolder] download failed for ${doc.storage_path}:`, dlErr?.message || dlErr);
          continue;
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        await dropboxUploadBuffer(token, destPath, buffer, { autorename: false });
        copied += 1;
      } catch (e) {
        failed += 1;
        console.warn(`[backfillLeadDataToJobFolder] doc ${fileName} skipped:`, e?.message || e);
      }
    }
  } catch (e) {
    console.warn("[backfillLeadDataToJobFolder] documents skipped:", e?.message || e);
  }

  // 2. Lead notes → INTERNAL/LEAD DOCS/LEAD-NOTES.txt
  try {
    const notesPath = `${leadDocsRoot}/LEAD-NOTES.txt`;
    if (!(await pathExists(token, notesPath))) {
      const { data: notes } = await sb
        .from("lead_notes")
        .select("body, note_type, author_name, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if ((notes || []).length > 0) {
        const text = (notes || [])
          .map(
            (n) =>
              `[${n.created_at || ""}] ${n.author_name || "Unknown"} (${n.note_type || "internal"}):\n${n.body || ""}`
          )
          .join("\n\n---\n\n");
        await dropboxUploadUtf8Text(token, notesPath, `${text}\n`, { autorename: false });
        copied += 1;
      }
    }
  } catch (e) {
    failed += 1;
    console.warn("[backfillLeadDataToJobFolder] notes skipped:", e?.message || e);
  }

  // 3. Lead conversations → INTERNAL/LEAD DOCS/LEAD-CONVERSATIONS.txt
  try {
    const convPath = `${leadDocsRoot}/LEAD-CONVERSATIONS.txt`;
    if (!(await pathExists(token, convPath))) {
      const { data: convos } = await sb
        .from("lead_conversations")
        .select("title, transcript_text, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if ((convos || []).length > 0) {
        const text = (convos || [])
          .map(
            (c) =>
              `=== ${c.title || "Conversation"} — ${c.created_at || ""} ===\n${c.transcript_text || ""}`
          )
          .join("\n\n");
        await dropboxUploadUtf8Text(token, convPath, `${text}\n`, { autorename: false });
        copied += 1;
      }
    }
  } catch (e) {
    failed += 1;
    console.warn("[backfillLeadDataToJobFolder] conversations skipped:", e?.message || e);
  }

  return { copied, failed };
}

export async function uploadTenderDocumentToJob(opts) {
  const token = await getDropboxAccessToken();
  const baseRoot = sharedJobRootPath(opts.jobAddress);
  const fromCategory = tenderSegmentsFromDocumentCategory(opts.documentCategory);
  const segments = fromCategory || classifyTenderUploadSegments(opts.fileName, opts.hints || "");
  const safeName = sanitizeOriginalPdfFileNameUpper(opts.fileName);
  const dropboxPath = `${baseRoot}/${segments.join("/")}/${safeName}`;
  return dropboxUploadBuffer(token, dropboxPath, opts.buffer, { autorename: true });
}

export async function saveRfqEmailCopyToDropbox(opts) {
  const token = await getDropboxAccessToken();
  const root = sharedJobRootPath(opts.jobAddress);
  const name = buildRfqEmailTxtFileName(opts.trade, opts.businessName);
  const dropboxPath = `${root}/INTERNAL/RFQ/${name}`;
  return dropboxUploadUtf8Text(token, dropboxPath, opts.textBody, { autorename: true });
}

export async function createFolderIfNotExists(accessToken, dropboxPath) {
  try {
    await rpc("files/create_folder_v2", { path: dropboxPath, autorename: false }, accessToken);
  } catch (e) {
    const msg = e?.message || String(e);
    if (/path\/conflict|already exists/i.test(msg)) return;
    throw e;
  }
}

export async function ensureParentFoldersForFile(accessToken, dropboxFilePath) {
  const raw = String(dropboxFilePath || "").trim();
  if (!raw) return;
  const norm = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = norm.split("/").filter(Boolean);
  if (parts.length <= 1) return;
  parts.pop();
  let acc = "";
  for (const p of parts) {
    acc = `${acc}/${p}`;
    await createFolderIfNotExists(accessToken, acc);
  }
}

/** INTERNAL/QUOTES/ACCEPTED and INTERNAL/QUOTES/DECLINED under the duplicated job folder. */
export async function ensureInternalQuoteSubfolders(jobAddress) {
  const token = await getDropboxAccessToken();
  const base = `${sharedJobRootPath(jobAddress)}/INTERNAL/QUOTES`;
  await createFolderIfNotExists(token, `${base}/ACCEPTED`);
  await createFolderIfNotExists(token, `${base}/DECLINED`);
}

/** Ensures `…/INTERNAL/QUOTES` exists under the team-visible job root (for inbound quote PDFs). */
export async function ensureSharedJobQuotesFolderExists(jobAddress) {
  const token = await getDropboxAccessToken();
  const root = sharedJobRootPath(jobAddress);
  await createFolderIfNotExists(token, `${root}/INTERNAL`);
  await createFolderIfNotExists(token, `${root}/INTERNAL/QUOTES`);
}

/**
 * Upload a quote PDF from an email reply to `{sharedJobRoot}/INTERNAL/QUOTES/{filename}` and return a viewable link.
 * @returns {Promise<{ path: string, sharedUrl: string, uploadMeta: object }>}
 */
export async function uploadImapReplyQuotePdfToSharedQuotes(jobAddress, originalFileName, buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!buf.length) throw new Error("uploadImapReplyQuotePdfToSharedQuotes: empty buffer");
  await ensureSharedJobQuotesFolderExists(jobAddress);
  const token = await getDropboxAccessToken();
  const safe = sanitizeOriginalPdfFileNameUpper(originalFileName);
  const fullPath = `${sharedJobRootPath(jobAddress)}/INTERNAL/QUOTES/${safe}`;
  const uploadMeta = await dropboxUploadBuffer(token, fullPath, buf, { autorename: true });
  const uploadedPath = uploadMeta.path_display || uploadMeta.path_lower || fullPath;
  const sharedUrl = await getOrCreateSharedLinkForPath(token, uploadedPath);
  return { path: uploadedPath, sharedUrl, uploadMeta };
}

/** INTERNAL/P.O for purchase order PDFs. */
export async function ensureInternalPoFolder(jobAddress) {
  const token = await getDropboxAccessToken();
  await createFolderIfNotExists(token, `${sharedJobRootPath(jobAddress)}/INTERNAL/P.O`);
}

export async function copyDropboxFile(accessToken, fromPath, toPath) {
  return rpc(
    "files/copy_v2",
    {
      from_path: fromPath,
      to_path: toPath,
      autorename: true,
      allow_shared_folder: false,
      allow_ownership_transfer: false
    },
    accessToken
  );
}

/**
 * Save win/lose/notification email copy under …/INTERNAL/RFQ/ (unique filename).
 */
export async function saveOutcomeEmailTxtToRfqFolder(opts) {
  const token = await getDropboxAccessToken();
  const root = sharedJobRootPath(opts.jobAddress);
  const tag = sanitizeTradeOrBusinessSegment(opts.tag || "OUTCOME", 24);
  const t = sanitizeTradeOrBusinessSegment(opts.trade, 40);
  const b = sanitizeTradeOrBusinessSegment(opts.businessName, 40);
  const name = `${tag}-${t}-${b}-${Date.now()}.txt`;
  const dropboxPath = `${root}/INTERNAL/RFQ/${name}`;
  return dropboxUploadUtf8Text(token, dropboxPath, opts.textBody, { autorename: true });
}

export async function uploadPoPdfToJobFolder(jobAddress, fileName, buffer) {
  const token = await getDropboxAccessToken();
  await ensureInternalPoFolder(jobAddress);
  const safe = String(fileName || "PO.PDF").replace(/[^\w.\-]/g, "_");
  const path = `${sharedJobRootPath(jobAddress)}/INTERNAL/P.O/${safe}`;
  return dropboxUploadBuffer(token, path, buffer, { autorename: false });
}

export async function uploadReceivedQuotePdfToJob(opts) {
  const token = await getDropboxAccessToken();
  const root = privateInternalJobRootPath(opts.jobAddress);
  const tradeFolder = sanitizeTradeOrBusinessSegment(opts.trade);
  const baseName = buildStandardQuotePdfFileName(opts.trade, opts.businessName);

  let chosen = `${root}/${QUOTES}/${tradeFolder}/${baseName}`;
  if (!(await pathExists(token, chosen))) {
    return dropboxUploadBuffer(token, chosen, opts.buffer, { autorename: false });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const withoutExt = baseName.replace(/\.PDF$/i, "");
  let dated = `${root}/${QUOTES}/${tradeFolder}/${withoutExt}-${stamp}.PDF`;
  let n = 0;
  while (await pathExists(token, dated)) {
    n += 1;
    dated = `${root}/${QUOTES}/${tradeFolder}/${withoutExt}-${stamp}-${n}.PDF`;
  }
  return dropboxUploadBuffer(token, dated, opts.buffer, { autorename: false });
}

/** Download file bytes from Dropbox (shared namespace path). */
export async function dropboxDownloadBuffer(accessToken, dropboxPath) {
  const namespaceId = await getTeamNamespaceId(accessToken);
  const arg = JSON.stringify({ path: dropboxPath });
  const res = await fetch(`${DROPBOX_CONTENT}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Path-Root": buildDropboxApiPathRootHeader(namespaceId),
      "Dropbox-API-Arg": arg
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(errText || `Dropbox download failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Download a file by its Dropbox shared link URL (requires sharing.read scope, not files.content.read). */
export async function dropboxDownloadSharedLink(accessToken, sharedUrl) {
  const arg = JSON.stringify({ url: sharedUrl });
  const res = await fetch(`${DROPBOX_CONTENT}/sharing/get_shared_link_file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": arg,
      "Content-Type": "text/plain"
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `Dropbox shared link download failed (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function isJobDataEmpty(v) {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/** Merge incoming job snapshot into existing JSON (prefer existing non-empty scalars). */
export function deepMergeJobDataJson(existing, incoming) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return base;
  for (const [k, nv] of Object.entries(incoming)) {
    if (isJobDataEmpty(nv)) continue;
    const ev = base[k];
    if (nv && typeof nv === "object" && !Array.isArray(nv) && ev && typeof ev === "object" && !Array.isArray(ev)) {
      base[k] = deepMergeJobDataJson(ev, nv);
      continue;
    }
    if (!isJobDataEmpty(ev) && (typeof ev === "string" || typeof ev === "number" || typeof ev === "boolean")) {
      continue;
    }
    base[k] = nv;
  }
  return base;
}

/**
 * Read/write …/INTERNAL/job-data.json under the shared job folder; merges patch without clobbering filled fields.
 */
export async function mergeJobDataJsonFile(jobAddress, patch) {
  const token = await getDropboxAccessToken();
  const root = sharedJobRootPath(jobAddress);
  const internal = `${root}/INTERNAL`;
  const path = `${internal}/job-data.json`;
  await createFolderIfNotExists(token, internal);
  let existing = {};
  try {
    const buf = await dropboxDownloadBuffer(token, path);
    const parsed = JSON.parse(buf.toString("utf8"));
    if (parsed && typeof parsed === "object") existing = parsed;
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/not_found|path\/not_found|404|Download failed \(409\)/i.test(msg)) throw e;
  }
  const merged = deepMergeJobDataJson(existing, patch);
  const text = `${JSON.stringify(merged, null, 2)}\n`;
  return dropboxUploadUtf8Text(token, path, text, { autorename: false });
}

/** Fee proposal PDF under shared job …/INTERNAL/PRESALE DOCS/ */
export async function uploadFeeProposalPdfToPresaleDocs(jobAddress, fileName, buffer) {
  const token = await getDropboxAccessToken();
  const root = sharedJobRootPath(jobAddress);
  const base = `${root}/INTERNAL/PRESALE DOCS`;
  await createFolderIfNotExists(token, `${root}/INTERNAL`);
  await createFolderIfNotExists(token, base);
  const safe = sanitizeOriginalPdfFileNameUpper(fileName);
  return dropboxUploadBuffer(token, `${base}/${safe}`, buffer, { autorename: true });
}

/** Client portal photos folder under shared job tree. */
export function portalPhotosFolderPath(jobAddress) {
  return `${sharedJobRootPath(jobAddress)}/INTERNAL/PORTAL`;
}

function safePortalFileName(fileName) {
  const base = String(fileName || "photo.jpg").replace(/[^\w.\-]+/g, "_").slice(0, 120);
  return base || "photo.jpg";
}

/**
 * Upload a portal photo to Dropbox INTERNAL/PORTAL.
 * @returns {{ storagePath: string, id?: string }}
 */
export async function uploadPortalPhoto({ jobAddress, buffer, fileName }) {
  const token = await getDropboxAccessToken();
  const folder = portalPhotosFolderPath(jobAddress);
  await createFolderIfNotExists(token, `${sharedJobRootPath(jobAddress)}/INTERNAL`);
  await createFolderIfNotExists(token, folder);
  const safe = safePortalFileName(fileName);
  const storagePath = `${folder}/${safe}`;
  const meta = await dropboxUploadBuffer(token, storagePath, buffer, { autorename: true });
  return {
    storagePath: meta?.path_display || meta?.path_lower || storagePath,
    id: meta?.id
  };
}
