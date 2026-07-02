/**
 * W02 — Qualification / Discovery API skeletons
 * W02-API-03, W02-API-04 (OUTCOME-STAMP-01)
 */
import { WRITE, post, patch, getAuthToken, serviceClient } from "./_helpers.mjs";

async function createLead(token, ts, suffix = "") {
  const { body } = await post(
    "/api/sales/leads",
    {
      first_name: "Outcome",
      last_name: `Stamp${suffix}${ts}`,
      email: `outcome-${suffix}${ts}@example.test`,
      lead_source: "referral", // mig 127: lead_source_category required on create
      stage: "enquiry",
    },
    token
  );
  return body?.lead?.id;
}

export async function runW02(run) {
  run.section("W02 Qualification / Discovery");

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    run.fail("Auth token", e.message);
    return;
  }

  if (!WRITE) {
    run.skip("W02-API-03 Stage gate bypass diagnostic", "requires --write");
    run.skip("W02-API-04 outcome stamping", "requires --write");
    run.gap(
      "W02-API-03 Stage gate bypass (read-only)",
      "PATCH accepts arbitrary stage — W02-DRIFT-006; SAM-W02-002 advisory"
    );
    run.gap(
      "W02-API-04 Lost/won stamping (read-only)",
      "won_at/lost_at/lost_reason on terminal stage move — W02-DRIFT-001"
    );
    return;
  }

  const svc = serviceClient();
  const ts = Date.now();
  const leadIds = [];

  try {
    // W02-API-03 — gate bypass diagnostic (advisory only; unchanged)
    const gateId = await createLead(token, ts, "Gate");
    if (!gateId) {
      run.fail("W02 setup", "Could not create gate test lead");
      return;
    }
    leadIds.push(gateId);

    const bypass = await patch(`/api/sales/leads/${gateId}`, { stage: "tender" }, token);
    // W01-DRIFT-003 (SAM-W02-002): bypass still succeeds (advisory), but is now SURFACED
    // via gateWarnings + logged. tender gate needs site_address + job_id (both absent here).
    if (bypass.status === 200 && bypass.body?.ok !== false) {
      const w = bypass.body?.gateWarnings;
      if (Array.isArray(w) && w.some(x => /site address/i.test(x)) && w.some(x => /job/i.test(x))) {
        run.pass("W01-DRIFT-003 gate bypass surfaced via gateWarnings (advisory, not blocked)");
      } else {
        run.fail(
          "W01-DRIFT-003 gate bypass surfaced via gateWarnings",
          `expected site_address + job warnings; got ${JSON.stringify(w)}`
        );
      }
    } else {
      run.fail("W02-API-03 advisory bypass should still succeed", `status ${bypass.status} (SAM-W02-002 = no hard block)`);
    }

    // W02-API-04 — lost_at on stage → lost
    const lostId = await createLead(token, ts, "Lost");
    if (!lostId) {
      run.fail("W02-API-04 setup lost lead", "create failed");
    } else {
      leadIds.push(lostId);
      const lost = await patch(`/api/sales/leads/${lostId}`, { stage: "lost" }, token);
      if (lost.status !== 200) {
        run.fail("W02-API-04 lost stage PATCH", `status ${lost.status}`);
      } else if (svc) {
        const { data: row } = await svc.from("leads").select("stage, lost_at, lost_reason").eq("id", lostId).single();
        if (row?.stage === "lost" && row?.lost_at) {
          run.pass("W02-API-04 lost stage stamps lost_at");
        } else {
          run.fail("W02-API-04 lost_at stamp", JSON.stringify(row));
        }
        const { data: acts } = await svc
          .from("lead_activities")
          .select("activity_type, summary")
          .eq("lead_id", lostId)
          .eq("activity_type", "stage_change");
        if (acts?.length >= 1) {
          run.pass("W02-API-04 stage_change activity on lost move");
        } else {
          run.fail("W02-API-04 stage_change activity", "missing stage_change row");
        }
      }
    }

    // W02-API-04 — lost_reason when supplied
    const reasonId = await createLead(token, ts, "Reason");
    if (!reasonId) {
      run.fail("W02-API-04 setup reason lead", "create failed");
    } else {
      leadIds.push(reasonId);
      const reason = await patch(
        `/api/sales/leads/${reasonId}`,
        { stage: "lost", lost_reason: "Budget mismatch" },
        token
      );
      if (reason.status !== 200) {
        run.fail("W02-API-04 lost_reason PATCH", `status ${reason.status}`);
      } else if (svc) {
        const { data: row } = await svc
          .from("leads")
          .select("lost_at, lost_reason")
          .eq("id", reasonId)
          .single();
        if (row?.lost_at && row?.lost_reason === "Budget mismatch") {
          run.pass("W02-API-04 lost_reason stored when supplied");
        } else {
          run.fail("W02-API-04 lost_reason", JSON.stringify(row));
        }
      }
    }

    // W02-API-04 — lost without reason does not invent lost_reason
    const noReasonId = await createLead(token, ts, "NoReason");
    if (!noReasonId) {
      run.fail("W02-API-04 setup no-reason lead", "create failed");
    } else {
      leadIds.push(noReasonId);
      await patch(`/api/sales/leads/${noReasonId}`, { stage: "lost" }, token);
      if (svc) {
        const { data: row } = await svc.from("leads").select("lost_reason").eq("id", noReasonId).single();
        if (row?.lost_reason == null || row?.lost_reason === "") {
          run.pass("W02-API-04 no invented lost_reason when omitted");
        } else {
          run.fail("W02-API-04 invented lost_reason", JSON.stringify(row));
        }
      }
    }

    // W02-API-04 — won_at on stage → won
    const wonId = await createLead(token, ts, "Won");
    if (!wonId) {
      run.fail("W02-API-04 setup won lead", "create failed");
    } else {
      leadIds.push(wonId);
      const won = await patch(`/api/sales/leads/${wonId}`, { stage: "won" }, token);
      if (won.status !== 200) {
        run.fail("W02-API-04 won stage PATCH", `status ${won.status}`);
      } else if (svc) {
        const { data: row } = await svc.from("leads").select("stage, won_at").eq("id", wonId).single();
        if (row?.stage === "won" && row?.won_at) {
          run.pass("W02-API-04 won stage stamps won_at");
        } else {
          run.fail("W02-API-04 won_at stamp", JSON.stringify(row));
        }
      }
    }

    // W02-API-04 — existing won_at not overwritten
    if (svc) {
      const { data: preWon } = await svc
        .from("leads")
        .insert({
          first_name: "Pre",
          last_name: `WonAt${ts}`,
          email: `prewon-${ts}@example.test`,
          stage: "tender",
          won_at: "2020-06-15",
        })
        .select("id")
        .single();
      if (preWon?.id) {
        leadIds.push(preWon.id);
        await patch(`/api/sales/leads/${preWon.id}`, { stage: "won" }, token);
        const { data: row } = await svc.from("leads").select("won_at").eq("id", preWon.id).single();
        if (row?.won_at === "2020-06-15") {
          run.pass("W02-API-04 existing won_at not overwritten");
        } else {
          run.fail("W02-API-04 won_at overwrite", `expected 2020-06-15, got ${row?.won_at}`);
        }
      }
    }

    // W02-API-04 — non-terminal stage does not stamp outcome fields
    const ntId = await createLead(token, ts, "NonTerm");
    if (!ntId) {
      run.fail("W02-API-04 setup non-terminal lead", "create failed");
    } else {
      leadIds.push(ntId);
      await patch(`/api/sales/leads/${ntId}`, { stage: "qualify" }, token);
      if (svc) {
        const { data: row } = await svc
          .from("leads")
          .select("won_at, lost_at, lost_reason")
          .eq("id", ntId)
          .single();
        if (!row?.won_at && !row?.lost_at && !row?.lost_reason) {
          run.pass("W02-API-04 non-terminal stage does not stamp outcome fields");
        } else {
          run.fail("W02-API-04 non-terminal stamp leak", JSON.stringify(row));
        }
      }
    }

    // W02-DRIFT-004 — AI transcript can apply name + site_address (critical handoff fields)
    const applyId = await createLead(token, ts, "Apply");
    if (!applyId) {
      run.fail("W02-DRIFT-004 setup apply lead", "create failed");
    } else {
      leadIds.push(applyId);
      const addr = `${ts} Apply Street, Adelaide SA 5000`;
      const conv = await post(
        `/api/sales/leads/${applyId}/conversations`,
        {
          transcript: "Client confirmed their name and the site address on the call.",
          applied_fields: { lead: { name: "Jess & Rick Apply", site_address: addr } },
        },
        token
      );
      if (conv.status === 200 && svc) {
        const { data: row } = await svc.from("leads").select("name, site_address").eq("id", applyId).single();
        if (row?.name === "Jess & Rick Apply" && row?.site_address === addr) {
          run.pass("W02-DRIFT-004 transcript apply writes name + site_address");
        } else {
          run.fail("W02-DRIFT-004 transcript apply name/site_address", JSON.stringify(row));
        }
      } else {
        run.fail("W02-DRIFT-004 conversations apply", `status ${conv.status} ${JSON.stringify(conv.body)}`);
      }
    }
  } finally {
    if (svc) {
      for (const id of leadIds) {
        await svc.from("lead_activities").delete().eq("lead_id", id);
        await svc.from("leads").delete().eq("id", id);
      }
    }
  }
}
