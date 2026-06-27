/**
 * W01 — Lead / CRM Intake API skeletons
 * W01-API-01, W01-API-02, W01-API-03, W01-SEC-03
 */
import { WRITE, MARK, API, get, post, patch, getAuthToken, serviceClient } from "./_helpers.mjs";

export async function runW01(run) {
  run.section("W01 Lead / CRM Intake");

  let token;
  try {
    token = await getAuthToken();
    run.pass("Auth token acquired");
  } catch (e) {
    run.fail("Auth token", e.message);
    return;
  }

  if (!WRITE) {
    run.skip("W01-API-01 Manual lead create creates activity", "requires --write");
  } else {
    const ts = Date.now();
    const svc = serviceClient();
    const { status, body } = await post(
      "/api/sales/leads",
      {
        first_name: "BatchA",
        last_name: `Test${ts}`,
        email: `batch-a-${ts}@example.test`,
        lead_source: "test",
      },
      token
    );
    const leadId = body?.lead?.id;
    if (status !== 200 || !body?.ok || !leadId) {
      run.fail("W01-API-01 Manual lead create creates activity", `POST failed: ${status} ${JSON.stringify(body)}`);
    } else {
      const detail = await get(`/api/sales/leads/${leadId}`, token);
      const activities = detail.body?.activities || [];
      const hasCreated = activities.some((a) => a.summary === "Lead created");
      if (hasCreated) run.pass("W01-API-01 Manual lead create creates activity");
      else run.fail("W01-API-01 Manual lead create creates activity", "No 'Lead created' activity row");
      if (svc) {
        await svc.from("lead_activities").delete().eq("lead_id", leadId);
        await svc.from("leads").delete().eq("id", leadId);
      }
    }
  }

  if (!WRITE) {
    run.skip("W01-API-02 Website enquiry activity behaviour", "requires --write");
  } else {
    const ts = Date.now();
    const svc = serviceClient();
    const { status, body } = await post("/api/public/enquiry", {
      name: `${MARK} Website ${ts}`,
      email: `web-${ts}@example.test`,
      project_description: "Batch A skeleton test",
    });
    const leadId = body?.lead?.id;
    if (status !== 200 || !body?.ok || !leadId) {
      run.fail("W01-API-02 Website enquiry activity behaviour", `POST failed: ${status}`);
    } else if (!svc) {
      run.skip("W01-API-02 Website enquiry activity behaviour", "no service role for activity check");
    } else {
      const { data: acts } = await svc.from("lead_activities").select("summary").eq("lead_id", leadId);
      const hasCreated = (acts || []).some((a) => a.summary === "Lead created");
      if (hasCreated) run.pass("W01-API-02 Website enquiry creates activity");
      else run.fail("W01-API-02 Website enquiry activity behaviour", "No 'Lead created' activity row");
      await svc.from("lead_activities").delete().eq("lead_id", leadId);
      await svc.from("leads").delete().eq("id", leadId);
    }
  }


  if (!WRITE) {
    run.skip("W01-API-03 CRM convert creates activity", "requires --write");
  } else {
    const ts = Date.now();
    const svc = serviceClient();
    const { status: cStatus, body: cBody } = await post(
      "/api/crm/contacts",
      { firstName: "BatchA", lastName: `Convert${ts}`, email: `crm-${ts}@example.test` },
      token
    );
    const contactId = cBody?.contact?.id;
    if (cStatus !== 200 || !cBody?.ok || !contactId) {
      run.fail("W01-API-03 CRM convert creates activity", `contact create failed: ${cStatus}`);
    } else {
      const { status, body } = await post(`/api/crm/contacts/${contactId}/convert`, {}, token);
      const leadId = body?.lead?.id;
      if (status !== 200 || !body?.ok || !leadId) {
        run.fail("W01-API-03 CRM convert creates activity", `convert failed: ${status}`);
      } else if (!svc) {
        run.skip("W01-API-03 CRM convert creates activity", "no service role for activity check");
      } else {
        const { data: acts } = await svc.from("lead_activities").select("summary").eq("lead_id", leadId);
        const hasCreated = (acts || []).some((a) => a.summary === "Lead created");
        if (hasCreated) run.pass("W01-API-03 CRM convert creates activity");
        else run.fail("W01-API-03 CRM convert creates activity", "No 'Lead created' activity row");
        if (svc) {
          await svc.from("lead_activities").delete().eq("lead_id", leadId);
          await svc.from("leads").delete().eq("id", leadId);
          await svc.from("crm_contacts").delete().eq("id", contactId);
        }
      }
    }
  }

  if (!WRITE) {
    run.gap(
      "W01-SEC-03 Public enquiry spam/rate-limit documented",
      "no rate limit/honeypot in code — run with --write for burst test"
    );
  } else {
    const ts = Date.now();
    const svc = serviceClient();
    // W01-SEC-003: rate limit keys on the real client IP (x-forwarded-for). Simulate a unique
    // public IP per run so the assertion is deterministic and never accumulates across runs.
    const fakeIp = `203.0.113.${(ts % 250) + 1}`;
    const enquire = (extra = {}) =>
      fetch(`${API}/api/public/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": fakeIp },
        body: JSON.stringify({ name: `${MARK} Burst ${ts}`, email: `burst-${ts}-${Math.random()}@example.test`, ...extra }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

    const ids = [];
    let got429 = false;
    for (let i = 0; i < 7; i++) {
      const { status, body } = await enquire();
      if (status === 429) got429 = true;
      if (body?.lead?.id) ids.push(body.lead.id);
    }
    if (got429) {
      run.pass("W01-SEC-03 public enquiry rate-limited after burst (429)");
    } else {
      run.fail("W01-SEC-03 public enquiry rate limit", "7 rapid POSTs from one IP — none 429 (W01-SEC-003 fix)");
    }
    // Honeypot: a filled hidden field → accepted but no lead created.
    const hp = await enquire({ website: "http://spam.example", email: `hp-${ts}@example.test` });
    if (hp.status === 200 && !hp.body?.lead) {
      run.pass("W01-SEC-03 honeypot field silently skips lead creation");
    } else {
      run.fail("W01-SEC-03 honeypot", `status ${hp.status} lead ${JSON.stringify(hp.body?.lead)}`);
    }
    if (svc) for (const id of ids) await svc.from("leads").delete().eq("id", id);
  }

  run.section("W01-API-08 convert-to-job site_address guard");

  if (!WRITE) {
    run.gap("W01-API-08 convert without site_address returns 400", "requires --write");
    run.gap("W01-API-08 convert with site_address succeeds", "requires --write");
  } else {
    const ts = Date.now();
    const svc = serviceClient();
    const siteAddress = `${ts} Test St, Adelaide SA 5000`;
    const { status: createStatus, body: createBody } = await post(
      "/api/sales/leads",
      {
        first_name: "BatchA",
        last_name: `Convert${ts}`,
        email: `convert-${ts}@example.test`,
        suburb: "Adelaide",
      },
      token
    );
    const leadId = createBody?.lead?.id;
    if (createStatus !== 200 || !createBody?.ok || !leadId) {
      run.fail("W01-API-08 setup", `lead create failed: ${createStatus} ${JSON.stringify(createBody)}`);
    } else {
      const { status: badStatus, body: badBody } = await post(
        `/api/sales/leads/${leadId}/convert-to-job`,
        {},
        token
      );
      if (
        badStatus === 400 &&
        badBody?.ok === false &&
        String(badBody?.error || "").toLowerCase().includes("site address")
      ) {
        run.pass("W01-API-08 convert without site_address returns 400");
      } else {
        run.fail(
          "W01-API-08 convert without site_address returns 400",
          `expected 400 site address error; got ${badStatus} ${JSON.stringify(badBody)}`
        );
      }

      const { status: patchStatus, body: patchBody } = await patch(
        `/api/sales/leads/${leadId}`,
        { site_address: siteAddress },
        token
      );
      if (patchStatus !== 200 || !patchBody?.ok) {
        run.fail("W01-API-08 patch site_address", `${patchStatus} ${JSON.stringify(patchBody)}`);
      } else {
        const { status: okStatus, body: okBody } = await post(
          `/api/sales/leads/${leadId}/convert-to-job`,
          {},
          token
        );
        const jobId = okBody?.job?.id;
        if (okStatus === 200 && okBody?.ok && jobId) {
          run.pass("W01-API-08 convert with site_address succeeds");
        } else {
          run.fail(
            "W01-API-08 convert with site_address succeeds",
            `expected 200 + job; got ${okStatus} ${JSON.stringify(okBody)}`
          );
        }
        if (svc) {
          if (jobId) {
            await svc.from("job_fact_history").delete().eq("job_id", jobId);
            await svc.from("job_events").delete().eq("job_id", jobId);
            await svc.from("jobs").delete().eq("id", jobId);
          }
          await svc.from("lead_activities").delete().eq("lead_id", leadId);
          await svc.from("leads").delete().eq("id", leadId);
        }
      }
    }
  }
}
