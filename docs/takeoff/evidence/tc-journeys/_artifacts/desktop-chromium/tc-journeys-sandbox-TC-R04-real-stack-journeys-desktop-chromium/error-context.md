# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tc-journeys-sandbox.spec.js >> TC-R04 real-stack journeys
- Location: e2e/ui-review/tc-journeys-sandbox.spec.js:45:1

# Error details

```
Error: journeys not passing

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "FL: FAIL expect(locator).toHaveCount(expected) failed",
+   "J5: FAIL Order not ready to export — Not ready to order yet: A piece is longer than the order ceiling — split it or change the material rule. The split pieces do not cover the run.",
+ ]
```

# Test source

```ts
  638 |       note: "computed.scheduleLines from the REAL sandbox server (GET workspace) just before ordering",
  639 |       materials: w0.snapshot.materials.map((m) => ({ id: m.id, name: m.name, methodKey: m.methodKey, family: m.spec?.family || "flashing" })),
  640 |       scheduleLines: w0.computed.scheduleLines.map((l) => ({ material: w0.snapshot.materials.find((m) => l.jobMaterialIds.includes(m.id))?.name, unit: l.unit || "piece", quantity: l.quantity,
  641 |         description: l.item?.description || null, finishedLengthMm: l.finishedLengthMm ?? null, stockLengthMm: l.item?.stockLengthMm ?? null, problems: l.problems, bucketKey: l.bucketKey })),
  642 |     }, null, 2));
  643 |     await openOrders();
  644 |     await press(page.getByRole("button", { name: "New order" }));
  645 |     await expect(page.getByText(/Draft FO-/)).toBeVisible({ timeout: 20_000 });
  646 |     const og = (id) => page.locator(`[data-order-group="${id}"]`);
  647 |     if (timberId) await expect(og(timberId).getByLabel(/Order quantity.*\(pieces\)/)).toHaveValue("18");
  648 |     if (axonId) await expect(og(axonId).getByLabel(/Order quantity.*\(sheets\)/)).toHaveValue("4");
  649 |     if (aluId) await expect(og(aluId).getByLabel(/Order quantity.*\(bars\)/)).toHaveValue("1");
  650 |     await deliveryDetails();
  651 |     await shot("order-review", `New order: every line defaults to what is still needed; ${isMobile ? "pick up (branch, ASAP)" : "deliver (address, required-by date)"}, site contact + phone`);
  652 |     const ready = await saveUntilReady("J5");
  653 |     observed.J5 = { ready };
  654 |     await expect(page.getByTestId("order-totals")).toContainText("18 pieces");
  655 |     await expect(page.getByTestId("order-totals")).toContainText("4 sheets");
  656 |     await expect(page.getByTestId("order-totals")).toContainText("1 bar");
  657 |     const { S, A } = await exportAndRead("J5");
  658 |     const checks = runChecks("J5", [...commonChecks(S, A),
  659 |       ["supplier", S, /1 × 9,000 9\.000/], ["supplier", S, /1 × 1,400 1\.400/],
  660 |       ["supplier", S, /3 pieces · 13\.600 LM/], ["supplier", S, /Order total: 3 flashing pieces · 13\.600 LM · 1 bar · 18 pieces · 4 sheets/],
  661 |       ["appendix", A, /Tight 10,000 mm along the path · corners at 6,000 mm · splits at 8,800 mm/],
  662 |       ["appendix", A, /Piece 1: 0–8,800 mm along the run (→|->) tight 8,800 (→|->) order 9,000 mm/],
  663 |       ["appendix", A, /Piece 2: 8,800–10,000 mm along the run (→|->) tight 1,200 (→|->) order 1,400 mm/]]);
  664 |     observed.J5.pdfChecks = checks.filter((c) => !c.ok);
  665 |     appendixFindings("J5", A);
  666 |     await saveOrders("J5");
  667 |     const failed = checks.filter((c) => !c.ok);
  668 |     expect(failed, `PDF text checks failed:\n${failed.map((c) => `${c.doc}: ${c.expect}`).join("\n")}`).toEqual([]);
  669 |   });
  670 | 
  671 |   // ═══ J5d — DIAGNOSTIC only (not the J5 acceptance): when J5 is blocked by the split-run defect, export the same
  672 |   //     order WITHOUT that run's flashing pieces, so the rest of J5 (export, both PDFs, quantities/units) is still
  673 |   //     proven end to end on the real stack ═══════════════════════════════════════════════════════════════════════
  674 |   if (results.find((r) => r.id === "J5")?.status !== "PASS") {
  675 |     await journey("J5d", "DIAGNOSTIC (not J5): same order minus the blocked split-run flashing pieces → non-draft export + both PDFs read back", async () => {
  676 |       await openOrders();
  677 |       if (!(await page.getByText(/Draft FO-/).isVisible().catch(() => false))) {
  678 |         await press(page.getByRole("button", { name: "New order" }));
  679 |         await expect(page.getByText(/Draft FO-/)).toBeVisible({ timeout: 20_000 });
  680 |         await deliveryDetails();
  681 |       }
  682 |       const rows = page.locator("li", { has: page.getByLabel(/^Qty/) });
  683 |       const removed = [];
  684 |       for (let i = 0; i < await rows.count(); i++) {
  685 |         const r = rows.nth(i);
  686 |         const t = (await r.innerText()).replace(/\s+/g, " ");
  687 |         if (!/^3,200 mm/.test(t)) { removed.push(t.slice(0, 60)); await num(r.getByLabel(/^Qty/), 0); }
  688 |       }
  689 |       note(`Set to 0 on this order (the run blocked by F1): ${removed.join(" | ")}`);
  690 |       observed.J5d = { removedFromOrder: removed };
  691 |       const ready = await saveUntilReady("J5d");
  692 |       observed.J5d.ready = ready;
  693 |       const { S, A } = await exportAndRead("J5d");
  694 |       const checks = runChecks("J5d", [...commonChecks(S, A),
  695 |         ["supplier", S, /1 piece · 3\.200 LM/], ["supplier", S, /Order total: 1 flashing piece · 3\.200 LM · 1 bar · 18 pieces · 4 sheets/]]);
  696 |       observed.J5d.pdfChecksFailed = checks.filter((c) => !c.ok);
  697 |       appendixFindings("J5d", A);
  698 |       await saveOrders("J5d");
  699 |       const failed = checks.filter((c) => !c.ok);
  700 |       expect(failed, `PDF text checks failed:\n${failed.map((c) => `${c.doc}: ${c.expect}`).join("\n")}`).toEqual([]);
  701 |     });
  702 |   }
  703 | 
  704 |   // ── write the evidence (always) ───────────────────────────────────────────────────────────────────────────
  705 |   const engine = page.context().browser();
  706 |   const browser = engine ? `${engine.browserType().name()} ${engine.version()}` : info.project.use.browserName;
  707 |   const viewport = JSON.stringify(page.viewportSize());
  708 |   const ua = await page.evaluate(() => navigator.userAgent).catch(() => "?");
  709 |   await page.close();
  710 |   const video = page.video();
  711 |   if (video) await video.saveAs(`${dir}/journeys.webm`).catch(() => {});
  712 |   writeFileSync(`${dir}/results.json`, JSON.stringify({ project, role, url: url.replace(BASE, "<sandbox>"), browser, viewport, userAgent: ua, results, findings, consoleErrors, at: new Date().toISOString() }, null, 2));
  713 |   const byJ = (id) => steps.filter((s) => s.journey === id);
  714 |   writeFileSync(`${dir}/STEPS.md`, [
  715 |     `# ${project} — TC-R04 real-stack journeys (isolated local sandbox)`,
  716 |     "",
  717 |     `Role: ${role}  `,
  718 |     `Route: \`${url.replace(BASE, "<sandbox>")}\`  `,
  719 |     `Browser engine: Playwright ${browser}${isMobile ? " · iPhone 13 emulation with touch (not a physical device)" : ""} · viewport ${viewport}  `,
  720 |     `User agent: \`${ua}\`  `,
  721 |     "Backend: scripts/takeoff/sandbox.mjs — real takeoff routes + Postgres (migrations 206 + 207) + pdfkit renderer; isolated DB `blh_takeoff_tc_evidence`.",
  722 |     "",
  723 |     ...results.flatMap((r) => [
  724 |       `## ${r.id} — ${r.title} — **${r.status}**`,
  725 |       ...(r.error ? ["", "```", r.error, "```"] : []),
  726 |       "",
  727 |       ...byJ(r.id).map((s, i) => `${i + 1}. ${s.file ? `\`${s.file}\` — ` : ""}${s.note}`),
  728 |       ...(r.observed ? ["", "Observed (real server): `" + JSON.stringify(r.observed).slice(0, 1500) + "`"] : []),
  729 |       "",
  730 |     ]),
  731 |     findings.length ? "## Findings\n\n" + findings.map((f) => `- **${f.id}** (${f.severity}, ${f.journey}) ${f.text}`).join("\n") + "\n" : "",
  732 |     consoleErrors.length ? "## Console errors\n\n" + consoleErrors.map((e) => `- ${e}`).join("\n") + "\n" : "## Console errors\n\nNone.\n",
  733 |     "Video of the whole run: `journeys.webm` · schedule: `schedule.json` · per order journey (J5, and J5d when J5 was blocked): `<J>-orders.json`, `<J>-supplier-order.pdf`, `<J>-site-appendix.pdf` (+ `.txt`, `<J>-pdf-checks.json`)",
  734 |     "",
  735 |   ].join("\n"));
  736 |   writeSummary();
  737 | 
> 738 |   expect(results.filter((r) => r.status !== "PASS").map((r) => `${r.id}: ${r.status} ${r.error?.split("\n")[0] || ""}`), "journeys not passing").toEqual([]);
      |                                                                                                                                                  ^ Error: journeys not passing
  739 | });
  740 | 
  741 | /** SUMMARY.md across both projects (whichever have run). */
  742 | function writeSummary() {
  743 |   const projects = ["desktop-chromium", "iphone13-webkit"];
  744 |   const R = Object.fromEntries(projects.map((p) => [p, existsSync(`${OUT}/${p}/results.json`) ? JSON.parse(readFileSync(`${OUT}/${p}/results.json`, "utf8")) : null]));
  745 |   const ids = [];
  746 |   for (const p of projects) for (const r of R[p]?.results || []) if (!ids.some((x) => x.id === r.id)) ids.push({ id: r.id, title: r.title });
  747 |   const cell = (p, id) => { const r = R[p]?.results.find((x) => x.id === id); return r ? r.status : "not run"; };
  748 |   // product defects across both browsers (one entry per finding id, with where it was seen)
  749 |   const defects = new Map();
  750 |   for (const p of projects) for (const f of R[p]?.findings || []) {
  751 |     const d = defects.get(f.id) || { ...f, seen: [] };
  752 |     d.seen.push(p); defects.set(f.id, d);
  753 |   }
  754 |   const lines = [
  755 |     "# TC-R04 real-stack journeys — SUMMARY",
  756 |     "",
  757 |     "Real app UI → isolated local sandbox (scripts/takeoff/sandbox.mjs: real takeoff server code, real Postgres with migrations 206 + 207, real pdfkit PDF renderer;",
  758 |     "database `blh_takeoff_tc_evidence`, API 127.0.0.1:8798, web :5188, reset before each browser). Nothing mocked on the takeoff path.",
  759 |     "Nothing sent to suppliers, nothing ordered, no production system touched. Spec: `e2e/ui-review/tc-journeys-sandbox.spec.js`, config: `playwright.tc-evidence.config.js`.",
  760 |     "",
  761 |     `| Journey | ${projects.join(" | ")} |`,
  762 |     `|---|${projects.map(() => "---").join("|")}|`,
  763 |     ...ids.map((j) => `| ${j.id} — ${j.title} | ${projects.map((p) => cell(p, j.id)).join(" | ")} |`),
  764 |     "",
  765 |     "J5d is a DIAGNOSTIC added only because J5 is blocked by F1: the same order with the split run's flashing pieces set to 0, so export + both PDFs",
  766 |     "(quantities and units of timber, sheets, bars and the 3,200 flashing) are still proven on the real stack. It is not the J5 acceptance.",
  767 |     "",
  768 |     "## Product defects found",
  769 |     "",
  770 |     ...(defects.size ? [...defects.values()].sort((a, b) => a.id.localeCompare(b.id)).flatMap((d) => [`### ${d.id} — ${d.severity || "defect"} — seen on ${d.seen.join(", ")}`, "", d.text, ""]) : ["None.", ""]),
  771 |     ...projects.filter((p) => R[p]).flatMap((p) => [
  772 |       `## ${p}`,
  773 |       "",
  774 |       `${R[p].role} · ${R[p].browser} · viewport ${R[p].viewport} · run ${R[p].at}`,
  775 |       `User agent: \`${R[p].userAgent}\``,
  776 |       "",
  777 |       ...R[p].results.filter((r) => r.status !== "PASS").flatMap((r) => [`**${r.id} ${r.status}**`, "", "```", (r.error || "").trim(), "```", ""]),
  778 |       `Console errors: ${R[p].consoleErrors.length ? "\n\n" + R[p].consoleErrors.map((e) => `- ${e}`).join("\n") : "none"}`,
  779 |       "",
  780 |       `Evidence: \`${p}/STEPS.md\`, screenshots \`${p}/NN-<journey>-*.png\`, \`${p}/journeys.webm\`, \`${p}/schedule.json\`, \`${p}/results.json\`; per order journey \`${p}/<J5|J5d>-supplier-order.pdf\`, \`-site-appendix.pdf\` (+ .txt), \`-pdf-checks.json\`, \`-orders.json\``,
  781 |       "",
  782 |     ]),
  783 |   ];
  784 |   writeFileSync(`${OUT}/SUMMARY.md`, lines.join("\n"));
  785 | }
  786 | 
```