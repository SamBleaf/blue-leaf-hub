/**
 * TenderPanel — the estimator's view of the SAME register (Tab 22 D6). Shows what is included, excluded,
 * by others and unresolved, the products specified and what still needs pricing — and links items to the
 * cost references that already exist in the estimate / fee proposal. It never copies a price and never
 * writes to estimating (Buildxact stays the single source of line pricing).
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/apiFetch.js";
import { answerSummary } from "../../../../lib/register.js";
import { Chip, Section, Select } from "./ui.jsx";

function Rows({ rows, empty, extra }) {
  if (!rows?.length) return <p className="text-[11px] text-muted">{empty}</p>;
  // The table scrolls inside its own box on a phone, so the page never scrolls sideways.
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full text-[11px]">
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t border-hairline/60 align-top">
            <td className="w-20 py-0.5 pr-2 font-mono text-[10px] text-muted">{r.ref}</td>
            <td className="w-28 py-0.5 pr-2 text-ink">{r.area}</td>
            <td className="py-0.5 pr-2">{r.description || answerSummary(r) || r.category}{r.linkedTo ? <span className="text-muted"> ({r.linkedTo})</span> : null}{r.product ? <span className="text-muted"> · {r.product}</span> : null}</td>
            <td className="py-0.5 pr-2 text-muted">{r.disposition}</td>
            {extra && <td className="py-0.5">{extra(r)}</td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function TenderPanel({ lead, reg, updateItem, flush }) {
  const [t, setT] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    await flush?.();
    const r = await apiFetch(`/api/register/leads/${lead.id}/tender`);
    if (r.ok) setT(r.data.tender); else setErr(r.error);
  }, [lead.id, flush]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="text-xs text-red-600">{err}</p>;
  if (!t) return <p className="text-xs text-muted">Building the tender view…</p>;
  const refOptions = t.costRefs.map((c) => [c.ref, c.label]);
  const assumptions = t.assumptions || [];
  const linkPicker = (r) => {
    const item = reg.items.find((i) => i.id === r.id);
    if (!item) return null;
    return refOptions.length
      ? <Select value={item.pricingRef} onChange={(v) => updateItem(item.id, { pricingRef: v, pricingStatus: v ? (item.pricingStatus === "not_reviewed" ? "allowance_or_estimate" : item.pricingStatus) : item.pricingStatus })}
          options={refOptions} placeholder="Link estimate line…" className="w-full min-w-[10rem] sm:w-56" />
      : <input value={item.pricingRef} onChange={(e) => updateItem(item.id, { pricingRef: e.target.value })} placeholder="estimate / RFQ ref" aria-label="Estimate or RFQ reference"
          className="inp w-full min-w-[8rem] text-[16px] sm:w-40 sm:text-[11px]" />;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>Drawing basis: <b className="text-ink">{t.drawingBasis || "not recorded"}</b></span>
        <span>· {t.drawings.length} drawing / consultant file(s)</span>
        <span>· {t.costRefs.length ? `${t.costRefs.length} estimate references available to link` : "no estimate on file yet — link refs by hand"}</span>
        <button type="button" onClick={load} className="ml-auto text-primary hover:underline">Refresh</button>
      </div>
      <Section title="Included work" count={t.included.length}><Rows rows={t.included} empty="No included scope recorded." /></Section>
      <Section title="Excluded / deferred" count={t.excluded.length}><Rows rows={t.excluded} empty="Nothing excluded." /></Section>
      <Section title="By others / client supplied" count={t.byOthers.length}><Rows rows={t.byOthers} empty="Nothing by others." /></Section>
      <Section title="Unresolved — decide before pricing is final" count={t.unresolved.length} defaultOpen={t.unresolved.length > 0}>
        <Rows rows={t.unresolved} empty="Nothing unresolved." extra={(r) => r.reasons.map((x) => <Chip key={x} tone="amber">{x}</Chip>)} />
      </Section>
      <Section title="Products specified" count={t.specified.length}><Rows rows={t.specified} empty="No specific products yet." /></Section>
      <Section title="Needs pricing — link to the existing estimate" count={t.needsPricing.length} defaultOpen={t.needsPricing.length > 0}>
        <Rows rows={t.needsPricing} empty="No in-scope item is waiting for a price source." extra={linkPicker} />
      </Section>
      <Section title="Blue Leaf pricing assumptions (internal)" count={assumptions.length} defaultOpen={assumptions.length > 0}>
        {assumptions.length === 0 ? <p className="text-[11px] text-muted">No pricing assumption is in use.</p> : (
          <ul className="space-y-1 text-[11px]" data-testid="tender-assumptions">
            {assumptions.map((a) => (
              <li key={a.key}>
                <span className="font-semibold text-ink">{a.label}: {a.tierLabel}.</span> <span className="text-ink">{a.text}</span>
                {a.draft && <span className="ml-1"><Chip>Draft wording</Chip></span>}
                {a.status === "part" && <span className="text-muted"> Covers only what isn&apos;t chosen{a.gaps?.length ? ` (${a.gaps.join(", ")})` : ""}.</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-muted">Assumptions for estimating. Not a client choice, an approval or a price. Anything the client has actually chosen replaces them.</p>
      </Section>
      <Section title="Technical risks to verify" count={t.risks.length} defaultOpen={false}><Rows rows={t.risks} empty="No open technical items." /></Section>
      <p className="text-[10px] text-muted">Links point at the existing estimate; prices stay in Buildxact / the fee proposal. “Quoted &amp; reviewed” means a builder-reviewed cost source — not a fixed contract amount.</p>
    </div>
  );
}
