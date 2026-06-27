#!/usr/bin/env node
/**
 * BLH-E2E-001 — Operations active board excludes soft-deleted ("…_DELETED") projects.
 *
 * Cleanup/anonymise scripts "soft-delete" a project by renaming its address to "…_DELETED"
 * (the projects table has no deleted_at column). The active Ops board must not surface them.
 * Seeds one normal + one _DELETED project, then asserts BOTH /api/operations/projects and
 * /api/operations/global-tasks exclude the _DELETED one (and keep the normal one). --write only.
 */
import { createRunner, assertServerUp, get, getAuthToken, serviceClient, WRITE } from "./_helpers.mjs";

const run = createRunner();
run.section("BLH-E2E-001 — Operations active board excludes _DELETED projects");

if (!(await assertServerUp(run))) process.exit(1);

if (!WRITE) {
  run.gap("BLH-E2E-001 /api/operations/projects excludes _DELETED", "requires --write (seeds projects)");
  run.gap("BLH-E2E-001 /api/operations/global-tasks excludes _DELETED", "requires --write (seeds projects)");
  const s = run.stats;
  console.log(`\n  Passed: ${s.passed}  Failed: ${s.failed}  Gap: ${s.gapDocumented}`);
  process.exit(0);
}

let token, svc;
try { token = await getAuthToken(); svc = serviceClient(); } catch (e) { run.fail("BLH-E2E-001 auth setup", e.message); process.exit(1); }
if (!svc) { run.fail("BLH-E2E-001 setup", "no service client"); process.exit(1); }

const ts = Date.now();
const normalAddr = `BLH TEST OPSFILTER ${ts} St, Adelaide SA 5000`;
const deletedAddr = `${normalAddr}_DELETED`;
let normalId = null, deletedId = null;
const listOf = (body) => (Array.isArray(body) ? body : (body?.projects || []));

try {
  const a = await svc.from("projects").insert({ address: normalAddr, status: "active" }).select("id").single();
  normalId = a.data?.id;
  const b = await svc.from("projects").insert({ address: deletedAddr, status: "active" }).select("id").single();
  deletedId = b.data?.id;
  if (!normalId || !deletedId) {
    run.fail("BLH-E2E-001 seed projects", `normal=${normalId} deleted=${deletedId} ${a.error?.message || ""} ${b.error?.message || ""}`);
  } else {
    const proj = await get("/api/operations/projects", token);
    const projAddrs = listOf(proj.body).map((p) => p.address || "");
    if (proj.status === 200 && projAddrs.includes(normalAddr) && !projAddrs.includes(deletedAddr)) {
      run.pass("BLH-E2E-001 /api/operations/projects excludes _DELETED, keeps active");
    } else {
      run.fail("BLH-E2E-001 /projects filter", `status=${proj.status} hasNormal=${projAddrs.includes(normalAddr)} deletedPresent=${projAddrs.includes(deletedAddr)}`);
    }

    const gt = await get("/api/operations/global-tasks", token);
    const gtAddrs = listOf(gt.body).map((p) => p.address || "");
    if (gt.status === 200 && !gtAddrs.includes(deletedAddr)) {
      run.pass("BLH-E2E-001 /api/operations/global-tasks excludes _DELETED");
    } else {
      run.fail("BLH-E2E-001 /global-tasks filter", `status=${gt.status} deletedPresent=${gtAddrs.includes(deletedAddr)}`);
    }
  }
} finally {
  if (svc) {
    if (normalId) await svc.from("projects").delete().eq("id", normalId);
    if (deletedId) await svc.from("projects").delete().eq("id", deletedId);
  }
}

const s = run.stats;
console.log(`\n  Passed: ${s.passed}  Failed: ${s.failed}  Gap: ${s.gapDocumented}`);
if (s.failures?.length) s.failures.forEach((f) => console.log(`   • ${f.name}: ${f.reason}`));
process.exit(s.failed > 0 ? 1 : 0);
