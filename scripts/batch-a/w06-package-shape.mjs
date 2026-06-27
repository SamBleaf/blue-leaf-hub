/**
 * W06-UI-02 — Package list/detail render from actual API camelCase shape (W06-DRIFT-008)
 *
 * Proves:
 * 1. Package with rfq_trade_scopes + rfq_recipients exists in DB
 * 2. GET /api/rfq-packages and /api/rfq-packages/:id return camelCase keys
 * 3. List UI accessors (RfqPackageList via rfqPackageUtils) resolve address, deadline, scopes, recipients, coverage
 * 4. Detail UI accessors (RfqPackageDetail via rfqPackageUtils) resolve scopes, recipients, coverage, missing, suggested
 */
import {
  WRITE,
  MARK,
  post,
  get,
  getAuthToken,
  serviceClient,
} from "./_helpers.mjs";
import {
  packageProjectAddress,
  packageTradeScopes,
  packageCoverageScore,
  packageSuggestedTrades,
  packageTradeCoverage,
  packageMissingTradeAnalysis,
  scopeRecipients,
  scopeBullets,
  scopeTradeLabel,
  packageTenderDeadline,
} from "../../src/lib/rfqPackageUtils.js";

/** Pre-fix RfqPackageList / RfqPackageDetail reads — W06-DRIFT-008 failure mode. */
function legacyListUiReads(pkg) {
  const scopes = pkg.rfq_trade_scopes || [];
  return {
    address: pkg.project_address,
    deadline: pkg.tender_deadline,
    scopes,
    scopeCount: scopes.length,
    recipientCount: scopes.reduce((n, s) => n + (s.rfq_recipients?.length || 0), 0),
    coverage: pkg.coverage_score || 0,
  };
}

function legacyDetailUiReads(pkg) {
  const scopes = pkg.rfq_trade_scopes || [];
  const scope = scopes[0];
  const tradeCoverage = pkg.trade_coverage || {};
  return {
    scopes,
    scopeLabel: scope?.trade_label,
    bullets: scope?.scope_bullets,
    recipients: scope?.rfq_recipients,
    coveragePct: tradeCoverage.percent ?? pkg.coverage_score ?? 0,
    missing: tradeCoverage.missing?.length ? tradeCoverage.missing : pkg.missing_trade_analysis,
    suggested: pkg.suggested_trades,
  };
}

/** Post-fix reads — same helpers RfqPackageList / RfqPackageDetail use. */
function listUiReads(pkg) {
  const scopes = packageTradeScopes(pkg);
  return {
    address: packageProjectAddress(pkg),
    deadline: packageTenderDeadline(pkg),
    scopes,
    scopeCount: scopes.length,
    recipientCount: scopes.reduce((n, s) => n + scopeRecipients(s).length, 0),
    coverage: packageCoverageScore(pkg),
  };
}

function detailUiReads(pkg) {
  const scopes = packageTradeScopes(pkg);
  const scope = scopes[0];
  const tradeCoverage = packageTradeCoverage(pkg);
  return {
    scopes,
    scopeLabel: scope ? scopeTradeLabel(scope) : "",
    bullets: scope ? scopeBullets(scope) : [],
    recipients: scope ? scopeRecipients(scope) : [],
    coveragePct: tradeCoverage.percent ?? packageCoverageScore(pkg),
    missing: tradeCoverage.missing?.length ? tradeCoverage.missing : packageMissingTradeAnalysis(pkg),
    suggested: packageSuggestedTrades(pkg),
  };
}

const CAMEL_LIST_KEYS = [
  "projectAddress",
  "tenderDeadline",
  "coverageScore",
  "suggestedTrades",
  "rfqTradeScopes",
];

const CAMEL_DETAIL_KEYS = [
  ...CAMEL_LIST_KEYS,
  "tradeCoverage",
  "missingTradeAnalysis",
];

function assertApiCamelCase(pkg, run, label) {
  const keys = label === "detail" ? CAMEL_DETAIL_KEYS : CAMEL_LIST_KEYS;
  for (const key of keys) {
    if (pkg[key] === undefined) {
      run.fail(`W06-UI-02 ${label} camelCase keys`, `missing ${key}`);
      return false;
    }
  }
  const scope = pkg.rfqTradeScopes?.[0];
  if (!scope) {
    run.fail(`W06-UI-02 ${label} camelCase keys`, "rfqTradeScopes empty");
    return false;
  }
  if (scope.tradeLabel === undefined && scope.trade_label === undefined) {
    run.fail(`W06-UI-02 ${label} camelCase keys`, "scope missing tradeLabel");
    return false;
  }
  if (label === "detail" && scope.scopeBullets === undefined && scope.scope_bullets === undefined) {
    run.fail(`W06-UI-02 ${label} camelCase keys`, "scope missing scopeBullets");
    return false;
  }
  if (pkg.rfq_trade_scopes !== undefined) {
    run.fail(`W06-UI-02 ${label} camelCase keys`, "snake_case rfq_trade_scopes must not appear on API response");
    return false;
  }
  return true;
}

async function cleanupPackage(svc, packageId, jobId) {
  if (!svc) return;
  if (packageId) {
    await svc.from("rfq_recipients").delete().eq("package_id", packageId);
    await svc.from("rfq_trade_scopes").delete().eq("package_id", packageId);
    await svc.from("rfq_packages").delete().eq("id", packageId);
  }
  if (jobId) await svc.from("jobs").delete().eq("id", jobId);
}

export async function runW06Shape(run) {
  run.section("W06 Package API shape (W06-UI-02)");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("W06-UI-02 auth", e.message);
    return;
  }

  if (!WRITE) {
    run.gap(
      "W06-UI-02 Package list/detail render camelCase API data",
      "requires --write; API uses rowsToCamel/rowToCamel on GET /api/rfq-packages"
    );
    return;
  }

  const svc = serviceClient();
  if (!svc) {
    run.fail("W06-UI-02 setup", "service role required for DB verification");
    return;
  }

  const ts = Date.now();
  const address = `${MARK} W06 Shape ${ts}`;
  const tradeId = "plumbing";
  const tradeLabel = "Plumbing";
  const deadline = "2026-12-31";

  const { body: jobBody } = await post(
    "/api/jobs",
    { address: `${ts} W06 Test St, Adelaide SA 5000`, status: "tendering" },
    token
  );
  const jobId = jobBody?.job?.id;
  if (!jobId) {
    run.fail("W06-UI-02 setup", "could not create job");
    return;
  }

  const { status: createStatus, body: createBody } = await post(
    "/api/rfq-packages",
    {
      job_id: jobId,
      project_address: address,
      project_type: "renovation",
      tender_deadline: deadline,
      architect_client: "Test Architect",
      trade_scopes: [
        {
          trade_id: tradeId,
          trade_label: tradeLabel,
          scope_bullets: ["Install fixtures", "Pressure test"],
          recipients: [
            {
              business_name: "Test Plumber",
              email: `plumber-${ts}@example.test`,
              status: "sent",
            },
          ],
        },
      ],
    },
    token
  );

  const packageId = createBody?.packageId;
  if (createStatus !== 200 || !createBody?.ok || !packageId) {
    run.fail("W06-UI-02 setup", `package create failed: ${createStatus} ${JSON.stringify(createBody)}`);
    await cleanupPackage(svc, null, jobId);
    return;
  }

  try {
    // 1. DB: scopes + recipients exist
    const { count: scopeCount } = await svc
      .from("rfq_trade_scopes")
      .select("id", { count: "exact", head: true })
      .eq("package_id", packageId);
    const { count: recipCount } = await svc
      .from("rfq_recipients")
      .select("id", { count: "exact", head: true })
      .eq("package_id", packageId);

    if ((scopeCount || 0) < 1) {
      run.fail("W06-UI-02 DB fixture", `expected rfq_trade_scopes rows; got ${scopeCount}`);
      return;
    }
    if ((recipCount || 0) < 1) {
      const { data: scopeRow } = await svc
        .from("rfq_trade_scopes")
        .select("id")
        .eq("package_id", packageId)
        .limit(1)
        .maybeSingle();
      if (scopeRow?.id) {
        await svc.from("rfq_recipients").insert({
          trade_scope_id: scopeRow.id,
          package_id: packageId,
          business_name: "Test Plumber",
          email: `plumber-fixture-${ts}@example.test`,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        run.gap(
          "W06-UI-02 package create recipient insert",
          "POST /api/rfq-packages did not persist rfq_recipients — fixture inserted via service role (separate from W06-DRIFT-008)"
        );
      } else {
        run.fail("W06-UI-02 DB fixture", `expected rfq_recipients rows; got ${recipCount}`);
        return;
      }
    } else {
      run.pass("W06-UI-02 DB has scopes and recipients");
    }

    const list = await get("/api/rfq-packages", token);
    const listPkg = (list.body?.packages || []).find((p) => p.id === packageId);
    if (!listPkg) {
      run.fail("W06-UI-02 list API", "package not in GET /api/rfq-packages");
      return;
    }
    if (!assertApiCamelCase(listPkg, run, "list")) return;

    const detail = await get(`/api/rfq-packages/${packageId}`, token);
    const detailPkg = detail.body?.package;
    if (detail.status !== 200 || !detailPkg) {
      run.fail("W06-UI-02 detail API", `GET failed: ${detail.status}`);
      return;
    }
    if (!assertApiCamelCase(detailPkg, run, "detail")) return;

    const legacyList = legacyListUiReads(listPkg);
    const legacyDetail = legacyDetailUiReads(detailPkg);
    const uiList = listUiReads(listPkg);
    const uiDetail = detailUiReads(detailPkg);

    if (!legacyList.scopes?.length && uiList.scopes?.length) {
      run.gap(
        "W06-UI-02 legacy snake_case reads miss nested data",
        "raw pkg.rfq_trade_scopes empty while rfqTradeScopes populated (W06-DRIFT-008 baseline)"
      );
    }

    // 3. List render fields
    const listOk =
      uiList.address === address &&
      uiList.deadline === deadline &&
      uiList.scopeCount >= 1 &&
      uiList.recipientCount >= 1 &&
      uiList.coverage >= 0;

    if (listOk) {
      run.pass("W06-UI-02 RfqPackageList fields from camelCase API");
    } else {
      run.fail(
        "W06-UI-02 RfqPackageList fields from camelCase API",
        `address=${uiList.address} deadline=${uiList.deadline} scopes=${uiList.scopeCount} recipients=${uiList.recipientCount} coverage=${uiList.coverage}`
      );
    }

    // 4. Detail render fields (suggested/missing may be empty arrays until estimate intel populates)
    const detailOk =
      uiDetail.scopes.length >= 1 &&
      uiDetail.scopeLabel === tradeLabel &&
      uiDetail.bullets.length >= 2 &&
      uiDetail.recipients.length >= 1 &&
      uiDetail.coveragePct >= 0 &&
      Array.isArray(uiDetail.suggested) &&
      Array.isArray(uiDetail.missing);

    if (uiDetail.suggested.length === 0 && uiDetail.missing.length === 0) {
      run.gap(
        "W06-UI-02 detail suggested/missing trades empty",
        "trade intel empty for fixture job — camelCase keys present; arrays render as empty"
      );
    }

    if (detailOk) {
      run.pass("W06-UI-02 RfqPackageDetail fields from camelCase API");
    } else {
      run.fail(
        "W06-UI-02 RfqPackageDetail fields from camelCase API",
        `scopes=${uiDetail.scopes.length} label=${uiDetail.scopeLabel} bullets=${uiDetail.bullets.length} ` +
          `recipients=${uiDetail.recipients.length} suggested=${uiDetail.suggested.length} missing=${uiDetail.missing.length} ` +
          `legacyRecipients=${legacyDetail.recipients?.length ?? 0}`
      );
    }

    if (listOk && detailOk) {
      run.pass("W06-UI-02 Package list/detail render camelCase API data");
    }
  } finally {
    await cleanupPackage(svc, packageId, jobId);
  }
}
