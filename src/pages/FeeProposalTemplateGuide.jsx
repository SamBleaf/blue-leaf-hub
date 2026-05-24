import { authFetch } from "../lib/authFetch.js";
import { Link } from "react-router-dom";
import { TEMPLATE_STORAGE_KEY } from "../lib/feeProposalDefaults.js";

export default function FeeProposalTemplateGuide() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20 text-sm leading-relaxed text-ink">
      <Link to="/tender-manager/fee-proposal" className="font-semibold text-accent underline">
        ← Fee proposals
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-primary">Word template setup</h1>
        <p className="mt-2 text-muted">
          The app uses <strong>docxtemplater</strong> to fill your existing BLB tender Word file. Design stays identical; only placeholders are replaced.
        </p>
        <p className="mt-2 text-xs text-muted">
          Template file is stored in this browser as base64 under key <code className="text-[11px]">{TEMPLATE_STORAGE_KEY}</code> when you upload in Step 3 or below.
        </p>
      </header>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">1. Open your existing BLB tender DOCX in Word</h2>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">2. Cover page placeholders</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 font-mono text-xs">
          <li>
            <code>{"{{QUOTE_NUMBER}}"}</code> — e.g. Quote 1191
          </li>
          <li>
            <code>{"{{PROJECT_ADDRESS}}"}</code>
          </li>
          <li>
            <code>{"{{DATE}}"}</code>
          </li>
          <li>
            <code>{"{{CLIENT_SALUTATION}}"}</code> — Dear line
          </li>
          <li>
            <code>{"{{ARCH_REF}}"}</code> <code>{"{{ENG_REF}}"}</code> <code>{"{{SPEC_REF}}"}</code>
          </li>
          <li>
            <code>{"{{TOTAL_INC_GST}}"}</code>
          </li>
          <li>
            <code>{"{{SIGNATORIES}}"}</code>
          </li>
          <li>
            <code>{"{{OPENING_PARAGRAPH}}"}</code> and <code>{"{{NEXT_STEPS}}"}</code> (optional body blocks)
          </li>
        </ul>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">3. Quote summary table (loop)</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-page p-3 font-mono text-[11px]">{`{#SUMMARY_ROWS}
{CATEGORY_NAME}  {CATEGORY_COST_GST}
{/SUMMARY_ROWS}
{{TOTAL_COST_GST}}`}</pre>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">4. Optional items</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-page p-3 font-mono text-[11px]">{`{#OPTIONAL_ITEMS}
{OPTION_DESCRIPTION}  {OPTION_PRICE}
{/OPTIONAL_ITEMS}`}</pre>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">5. Fee schedule</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-page p-3 font-mono text-[11px]">{`{#FEE_SCHEDULE}
{STAGE_CLAIM}  {MILESTONE}  {PERCENTAGE}
{/FEE_SCHEDULE}`}</pre>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">6. Inclusions (nested loop)</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-page p-3 font-mono text-[11px]">{`{#INCLUSION_SECTIONS}
{SECTION_HEADING}
{#SECTION_ITEMS}• {ITEM_TEXT}
{/SECTION_ITEMS}
{/INCLUSION_SECTIONS}`}</pre>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">7. PC sums & exclusions</h2>
        <pre className="mt-3 overflow-x-auto rounded bg-page p-3 font-mono text-[11px]">{`{#PC_SUMS}
{PC_DESCRIPTION}  {PC_AMOUNT}
{/PC_SUMS}

{#EXCLUSIONS}
{EXCLUSION_TEXT}
{/EXCLUSIONS}`}</pre>
      </section>

      <section className="rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-primary">9. Upload template here</h2>
        <input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-3 block text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const b64 = await new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve(typeof r.result === "string" ? r.result.split(",")[1] || "" : "");
              r.onerror = () => reject(r.error);
              r.readAsDataURL(f);
            });
            localStorage.setItem(TEMPLATE_STORAGE_KEY, b64);
            // Push to server so it persists across browsers / devices
            try {
              await authFetch("/api/settings/fee-proposal-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dataBase64: b64 })
              });
              alert("Template saved to server and this browser.");
            } catch {
              alert("Template saved in this browser (server sync failed — will retry next upload).");
            }
          }}
        />
      </section>
    </div>
  );
}
