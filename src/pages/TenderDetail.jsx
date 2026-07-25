import { authFetch } from "../lib/authFetch.js";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getSupabase, supabaseConfigured } from "../lib/supabaseClient";
import { formatSignatureFooter, loadEmailSignature } from "../lib/rfqSettings.js";
import { plainBodyToHtml } from "../lib/rfqComposer.js";
import { sharedJobDropboxRootPath } from "../lib/companySettings.js";
import { useBlueprintContext } from "../lib/BlueprintContext.jsx";
import { TRADE_LABEL, subcontractorsForTrade } from "../lib/tradeTemplates.js";
import { bulletsFromTradeNote, coerceExtraction, RFQ_TRADE_ORDER } from "../lib/rfqExtraction.js";

const JOB_STATUS_BADGE = {
  tendering: { label: "Tendering", cls: "bg-[#FEF3C7] text-[#92400E]" },
  won: { label: "Won", cls: "bg-[#DCFCE7] text-[#166534]" },
  lost: { label: "Lost", cls: "bg-[#FEE2E2] text-[#991B1B]" },
  archived: { label: "Archived", cls: "bg-[#F1F5F9] text-[#475569]" }
};

const RFQ_STATUS_VIS = {
  queued: { label: "Queued", cls: "bg-zinc-200 text-zinc-800" },
  sent: { label: "Sent", cls: "bg-blue-100 text-blue-900" },
  reminded: { label: "Reminded", cls: "bg-amber-100 text-amber-900" },
  received: { label: "Received", cls: "bg-emerald-100 text-emerald-900" },
  accepted: { label: "Accepted", cls: "bg-emerald-900/90 text-white" },
  declined: { label: "Declined", cls: "bg-zinc-300 text-zinc-800" },
  not_required: { label: "Not required", cls: "bg-slate-200 text-slate-700" }
};

// Saved email templates for the "Email recipients" blast — written in Sam's voice (a builder:
// warm, direct, first-name, no corporate/AI filler, an Aussie "give us a yell / no dramas / cheers").
// ONE body goes to every selected recipient (threaded to their RFQ), so greetings stay generic;
// these are a starting point you edit before sending. ctx = { address, link, deadline }.
const EMAIL_TEMPLATES = [
  {
    id: "plans",
    label: "Updated plans",
    build: ({ address, link }) =>
      `Hi,\n\nQuick heads up — we've updated the plans for ${address || "the project"}. Grab the latest set here (opens for anyone, no Dropbox login needed):\n\n${link || "[plans link]"}\n\nThe scope hasn't changed, just make sure you're pricing off the current drawings. Give us a yell if anything's unclear.\n\nCheers,\nSam`,
  },
  {
    id: "reminder",
    label: "Reminder",
    build: ({ address, deadline }) =>
      `Hi,\n\nJust chasing your quote for ${address || "the project"} when you get a chance${deadline ? ` — we're hoping to have everything in by ${deadline}` : ""}. No dramas if you need a bit more time, just flick me a line and let me know where you're at.\n\nCheers,\nSam`,
  },
  {
    id: "received",
    label: "Received — thanks",
    build: ({ address }) =>
      `Hi,\n\nGot your quote through for ${address || "the project"} — appreciate you getting that back to us. We're working through the numbers now and I'll be in touch shortly either way.\n\nCheers,\nSam`,
  },
  {
    id: "won",
    label: "You've won it",
    build: ({ address }) =>
      `Hi,\n\nGood news — we'd like to go ahead with your quote for ${address || "the project"}. Really happy to have you on board. I'll be in touch soon to lock in start dates and sort the paperwork.\n\nCheers,\nSam`,
  },
  {
    id: "lost",
    label: "Not this time",
    build: ({ address }) =>
      `Hi,\n\nThanks for taking the time to quote ${address || "the project"} — genuinely appreciate it. We've gone another way on this one, but your pricing was solid and I'll keep you in mind for the next job that suits.\n\nCheers,\nSam`,
  },
];

// Step 7 — one row per quote submission with correction + verification controls.
// Verifying confirms the commercial amount and flags it VERIFIED — the gate that lets a current,
// non-superseded quote feed Cost-Intelligence benchmarks (see tenderReadModel). Amount is editable
// while unverified so a wrong / missing extracted total can be corrected before it's trusted.
function SubmissionRow({ s, rfqId, busy, readOnly, showAward, onPatch, onPrimary, onAward, onUnaward }) {
  const [amt, setAmt] = useState(s.amountExGst != null ? String(s.amountExGst) : "");
  const verified = s.verificationStatus === "verified";
  const rejected = s.verificationStatus === "rejected";
  const fmt = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const atts = s.attachments || [];
  const amtValid = amt !== "" && Number.isFinite(Number(amt)) && Number(amt) >= 0;
  return (
    <div className={`rounded-md px-2 py-1.5 ring-1 ${s.isAccepted ? "bg-emerald-50 ring-emerald-300" : "bg-white/70 ring-amber-200/60"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="text-muted">v{s.version}{s.isCurrent ? " · current" : ""}{s.subScopeLabel ? ` · ${s.subScopeLabel}` : ""}</span>
        {s.isAccepted && <span className="rounded-full bg-emerald-700 px-1.5 py-0.5 font-semibold text-white">✓ Awarded</span>}
        {verified && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">✓ Verified</span>}
        {rejected && <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 font-semibold text-zinc-600">✗ Rejected</span>}
        {!verified && !rejected && s.amountExGst != null && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Needs review</span>}
        {(verified || rejected || readOnly) ? (
          <span className="tabular-nums font-semibold text-ink">{s.amountExGst != null ? fmt(s.amountExGst) : "no amount"}</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <span className="text-muted">$</span>
            <input
              type="number" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount ex GST"
              className="w-28 rounded border border-amber-300 bg-white px-1 py-0.5 text-[11px] tabular-nums"
            />
          </span>
        )}
        {!readOnly && !verified && !rejected && (
          <>
            <button
              type="button" disabled={busy || !amtValid}
              onClick={() => onPatch(s.id, { confirmedAmountExGst: Number(amt), verificationStatus: "verified" })}
              className="rounded bg-emerald-600 px-2 py-0.5 font-semibold text-white disabled:opacity-40"
            >Verify</button>
            <button
              type="button" disabled={busy}
              onClick={() => onPatch(s.id, { verificationStatus: "rejected" })}
              className="rounded border border-zinc-300 px-2 py-0.5 font-semibold text-zinc-600 disabled:opacity-40"
            >Reject</button>
          </>
        )}
        {!readOnly && (verified || rejected) && (
          <button
            type="button" disabled={busy}
            onClick={() => onPatch(s.id, { verificationStatus: "unverified" })}
            className="rounded border border-hairline px-2 py-0.5 font-semibold text-muted disabled:opacity-40"
          >{verified ? "Un-verify" : "Restore"}</button>
        )}
        {!readOnly && !rejected && (showAward || s.isAccepted) && (
          s.isAccepted
            ? <button type="button" disabled={busy} onClick={() => onUnaward(rfqId)} className="ml-auto rounded border border-hairline px-2 py-0.5 font-semibold text-muted disabled:opacity-40">Un-accept</button>
            : <button type="button" disabled={busy} onClick={() => onAward(rfqId, s.id)} className="ml-auto rounded border border-accent px-2 py-0.5 font-semibold text-accent disabled:opacity-40">Accept this quote</button>
        )}
      </div>
      {atts.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          {atts.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1">
              {a.pdfUrl
                ? <a href={a.pdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{a.filename || "PDF"}</a>
                : <span className="text-muted">{a.filename || "file"}</span>}
              {atts.length > 1 && (a.isPrimary
                ? <span className="rounded bg-primary/10 px-1 font-semibold text-primary">primary</span>
                : (!readOnly && <button type="button" disabled={busy} onClick={() => onPrimary(a.id, s.id)} className="text-muted underline decoration-dotted disabled:opacity-40">make primary</button>))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── UX redesign phase 3b: the desktop comparison table ──────────────────────
// Cards stay on mobile (lg:hidden); desktop renders this dense table. Reuses the exact same
// verify/award/patch handlers as the cards — it's a re-rendering of proven data, not new logic.
function fmtAud(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
}

// Row-level ⋯ menu. Change-trade / change-sub / split / remove land in phase 4 (need endpoints);
// for now it exposes the reply + decline actions that already exist.
function TKebab({ rfq, readOnly, on }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    // Defer attaching past the opening click, or that same click would immediately close it.
    const id = setTimeout(() => document.addEventListener("click", close), 0);
    return () => { clearTimeout(id); document.removeEventListener("click", close); };
  }, [open]);
  // Fixed positioning (computed from the button's rect) so the menu escapes the table's
  // overflow-x-auto container, which would otherwise clip an absolutely-positioned dropdown.
  const toggle = (e) => {
    if (!open) { const r = e.currentTarget.getBoundingClientRect(); setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }); }
    setOpen((o) => !o);
  };
  return (
    <span className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={toggle} className="rounded-md border border-hairline px-2 py-1 text-xs font-bold leading-none text-muted hover:bg-page">⋯</button>
      {open && pos && (
        <div style={{ position: "fixed", top: pos.top, right: pos.right }} className="z-[80] w-48 rounded-lg border border-hairline bg-surface p-1 text-xs shadow-lg">
          <button type="button" onClick={() => { setOpen(false); on.query(rfq); }} className="block w-full rounded px-2 py-1.5 text-left text-ink hover:bg-page">Reply / query</button>
          {!readOnly && <button type="button" onClick={() => { setOpen(false); on.decline(rfq.id); }} className="block w-full rounded px-2 py-1.5 text-left text-muted hover:bg-page">Decline</button>}
          {!readOnly && (
            <>
              <div className="my-1 border-t border-hairline" />
              <div className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide text-muted/70">Fix a mistake</div>
              <button type="button" onClick={() => { setOpen(false); on.changeTrade(rfq); }} className="block w-full rounded px-2 py-1.5 text-left text-ink hover:bg-page">Change trade</button>
              <button type="button" onClick={() => { setOpen(false); on.split(rfq); }} className="block w-full rounded px-2 py-1.5 text-left text-ink hover:bg-page">Label / split scopes</button>
              <button type="button" onClick={() => { setOpen(false); on.remove(rfq); }} className="block w-full rounded px-2 py-1.5 text-left font-semibold text-danger hover:bg-danger/10">Remove recipient</button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

// One table row for a submission (a sub's quote for a scope). Parallel scopes = sibling rows.
function TSubRow({ s, rfq, busy, readOnly, on }) {
  const [amt, setAmt] = useState(s.amountExGst != null ? String(s.amountExGst) : "");
  const verified = s.verificationStatus === "verified";
  const rejected = s.verificationStatus === "rejected";
  const amtValid = amt !== "" && Number.isFinite(Number(amt)) && Number(amt) >= 0;
  const primary = (s.attachments || []).find((a) => a.isPrimary) || (s.attachments || [])[0];
  return (
    <tr className={`border-t border-hairline align-top ${s.isAccepted ? "bg-emerald-50/60" : "hover:bg-page/40"}`}>
      <td className="px-3 py-2">
        <div className="font-semibold text-ink">
          {s.subScopeLabel && <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{s.subScopeLabel}</span>}
          {rfq.subcontractors?.business_name || "—"}
        </div>
        <div className="text-[11px] text-muted">{(rfq.subcontractors?.contact || "") + (rfq.subcontractors?.email ? ` · ${rfq.subcontractors.email}` : "")}</div>
      </td>
      <td className="px-3 py-2 text-[11px] whitespace-nowrap">
        {s.isAccepted && <span className="mr-1 inline-block rounded-full bg-emerald-700 px-1.5 py-0.5 font-semibold text-white">✓ Awarded</span>}
        {verified
          ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">✓ Verified</span>
          : rejected
            ? <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 font-semibold text-zinc-600">Rejected</span>
            : <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">Needs review</span>}
      </td>
      <td className="px-3 py-2 text-[11px]">
        {primary?.pdfUrl ? <a href={primary.pdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{primary.filename || "PDF"}</a> : <span className="text-muted">—</span>}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {(verified || rejected || readOnly)
          ? <span className="font-bold tabular-nums text-ink">{s.amountExGst != null ? fmtAud(s.amountExGst) : "—"}</span>
          : (
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 ${amtValid ? "border-hairline" : "border-amber-300 bg-amber-50/50"}`}>
              <span className="text-muted">$</span>
              <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount" className="w-20 bg-transparent text-right text-xs font-semibold tabular-nums outline-none" />
            </span>
          )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          {!readOnly && !verified && !rejected && (
            <button type="button" disabled={busy || !amtValid} onClick={() => on.patch(s.id, { confirmedAmountExGst: Number(amt), verificationStatus: "verified" })} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40">Verify</button>
          )}
          {!readOnly && (verified || rejected) && (
            <button type="button" disabled={busy} onClick={() => on.patch(s.id, { verificationStatus: "unverified" })} className="rounded-md border border-hairline px-2 py-1 text-xs font-semibold text-muted disabled:opacity-40">{verified ? "Un-verify" : "Restore"}</button>
          )}
          {!readOnly && (s.isAccepted
            ? <button type="button" disabled={busy} onClick={() => on.unaward(rfq.id)} className="rounded-md border border-hairline px-2 py-1 text-xs font-semibold text-muted disabled:opacity-40">Un-accept</button>
            : <button type="button" disabled={busy} onClick={() => on.award(rfq.id, s.id)} className="rounded-md border border-accent px-2 py-1 text-xs font-semibold text-accent disabled:opacity-40">Award</button>)}
          <TKebab rfq={rfq} readOnly={readOnly} on={on} />
        </div>
      </td>
    </tr>
  );
}

// One table row for a recipient with NO submission yet (manual / awaiting). Legacy amount + toggle-award.
function TLegacyRow({ rfq, readOnly, on }) {
  const overdue = isOverdue(rfq.deadline, rfq.status);
  const vis = overdue ? { label: "Overdue", cls: "bg-red-100 text-red-700" } : (RFQ_STATUS_VIS[rfq.status] || RFQ_STATUS_VIS.sent);
  const pdfHref = String(rfq.quote_pdf_url || rfq.dropbox_pdf_url || "").trim();
  const pdfOpenUrl = pdfHref.startsWith("http") ? pdfHref : "";
  const accepted = rfq.status === "accepted";
  return (
    <tr className="border-t border-hairline align-top hover:bg-page/40">
      <td className="px-3 py-2">
        <div className="font-semibold text-ink">{rfq.subcontractors?.business_name || "—"}</div>
        <div className="text-[11px] text-muted">{(rfq.subcontractors?.contact || "") + (rfq.subcontractors?.email ? ` · ${rfq.subcontractors.email}` : "")}</div>
      </td>
      <td className="px-3 py-2 text-[11px] whitespace-nowrap"><span className={`rounded-full px-1.5 py-0.5 font-semibold ${vis.cls}`}>{vis.label}</span></td>
      <td className="px-3 py-2 text-[11px]">{pdfOpenUrl ? <a href={pdfOpenUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Quote PDF</a> : <span className="text-muted">—</span>}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {readOnly
          ? <span className="tabular-nums text-ink">{rfq.quote_amount != null ? fmtAud(rfq.quote_amount) : "—"}</span>
          : (
            <span className="inline-flex items-center gap-1 rounded border border-hairline px-1.5 py-1">
              <span className="text-muted">$</span>
              <input type="number" defaultValue={rfq.quote_amount ?? ""} placeholder="amount" className="w-20 bg-transparent text-right text-xs font-semibold tabular-nums outline-none"
                onBlur={(e) => { const v = e.target.value; if (v === String(rfq.quote_amount ?? "")) return; on.updateRfq(rfq.id, { quote_amount: v === "" ? null : Number(v), manually_entered: true }); }} />
            </span>
          )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          {!readOnly && (accepted
            ? <button type="button" onClick={() => on.toggleAccept(rfq)} className="rounded-md border border-hairline px-2 py-1 text-xs font-semibold text-muted">Un-award</button>
            : <button type="button" disabled={!(rfq.quote_amount > 0 || rfq.quoted_amount > 0)} onClick={() => on.toggleAccept(rfq)} className="rounded-md border border-accent px-2 py-1 text-xs font-semibold text-accent disabled:opacity-40">Award</button>)}
          <TKebab rfq={rfq} readOnly={readOnly} on={on} />
        </div>
      </td>
    </tr>
  );
}

// The desktop table: rows grouped by trade with a per-trade comparison header.
function TenderCompareTable({ rows, tradeGroups, amountOfRfq, subView, submissionBusy, readOnly, canAddSub, on }) {
  const seen = new Set();
  return (
    <div className="overflow-x-auto rounded-card border border-hairline bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hairline bg-page/60 text-[10px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-semibold">Subcontractor</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Quote file</th>
            <th className="px-3 py-2 text-right font-semibold">Quote (ex GST)</th>
            <th className="px-3 py-2 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = r.trade || "(untraded)";
            const first = !seen.has(t);
            if (first) seen.add(t);
            const group = tradeGroups.get(t) || [r];
            const priced = group.map((x) => amountOfRfq(x)).filter((a) => a != null).sort((a, b) => a - b);
            const subs = subView[r.id] || [];
            return (
              <Fragment key={r.id}>
                {first && (
                  <tr className="border-t border-hairline bg-page/40">
                    <td colSpan={5} className="px-3 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-bold text-ink">{TRADE_LABEL[r.trade] || r.trade}</span>
                        <span className="text-[11px] text-muted">{priced.length}/{group.length} quoted{priced.length ? <> · lowest <b className="tabular-nums text-ink">{fmtAud(priced[0])}</b></> : null}</span>
                        {canAddSub && <button type="button" onClick={() => on.addSub(r.trade)} className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold text-primary hover:border-primary/40">+ sub</button>}
                      </div>
                    </td>
                  </tr>
                )}
                {subs.length
                  ? subs.map((s) => <TSubRow key={s.id} s={s} rfq={r} busy={!!submissionBusy[s.id]} readOnly={readOnly} on={on} />)
                  : <TLegacyRow rfq={r} readOnly={readOnly} on={on} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Phase 4 — the "rectify in the UI" sheet: change a recipient's trade, label/split its scopes
// (the real cabinetry-vs-stone fix — give each quote its own sub_scope_label so neither supersedes
// the other), or remove a junk recipient.
function EditRowModal({ editRow, subView, onClose, onChangeTrade, onPatchSub, onRemove }) {
  const { type, rfq } = editRow;
  const subs = subView[rfq.id] || [];
  const [trade, setTrade] = useState(rfq.trade || "");
  const [labels, setLabels] = useState(() => Object.fromEntries(subs.map((s) => [s.id, s.subScopeLabel || ""])));
  const [busy, setBusy] = useState(false);
  const tradeOptions = [...new Set(RFQ_TRADE_ORDER.map((k) => TRADE_LABEL[k] || k))];
  const subName = rfq.subcontractors?.business_name || "this subcontractor";
  const run = async (fn) => { setBusy(true); try { await fn(); onClose(); } finally { setBusy(false); } };
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-card border border-hairline bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {type === "trade" && (
          <>
            <h3 className="text-lg font-bold text-primary">Change trade</h3>
            <p className="mt-1 text-sm text-muted">Move <b>{subName}</b> to the correct trade.</p>
            <select value={trade} onChange={(e) => setTrade(e.target.value)} className="mt-4 w-full rounded-lg border border-hairline px-3 py-2 text-sm">
              {!tradeOptions.includes(trade) && trade ? <option value={trade}>{trade}</option> : null}
              {tradeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={onClose}>Cancel</button>
              <button type="button" disabled={busy || !trade || trade === rfq.trade} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => run(() => onChangeTrade(rfq.id, trade))}>Save</button>
            </div>
          </>
        )}
        {type === "split" && (
          <>
            <h3 className="text-lg font-bold text-primary">Label the scopes</h3>
            <p className="mt-1 text-sm text-muted">Give each quote its own scope so two prices from one sub (e.g. <b>cabinetry</b> + <b>benchtops</b>) sit side by side — neither supersedes the other or drops out of the comparison.</p>
            {subs.length === 0 ? (
              <p className="mt-4 rounded-lg bg-page px-3 py-3 text-sm text-muted">No quotes on record for {subName} yet.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {subs.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="truncate font-semibold text-ink">{s.attachments?.[0]?.filename || `Quote v${s.version}`}</div>
                      <div className="text-muted">{s.amountExGst != null ? fmtAud(s.amountExGst) : "no amount"}</div>
                    </div>
                    <input value={labels[s.id] || ""} onChange={(e) => setLabels((l) => ({ ...l, [s.id]: e.target.value }))} placeholder="scope e.g. Cabinetry" className="w-40 rounded-lg border border-hairline px-2 py-1.5 text-sm" />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={onClose}>Cancel</button>
              <button type="button" disabled={busy || subs.length === 0} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                onClick={() => run(async () => { for (const s of subs) { const v = (labels[s.id] || "").trim(); if (v !== (s.subScopeLabel || "")) await onPatchSub(s.id, { subScopeLabel: v || null }); } })}>Save scopes</button>
            </div>
          </>
        )}
        {type === "remove" && (
          <>
            <h3 className="text-lg font-bold text-danger">Remove recipient</h3>
            <p className="mt-2 text-sm text-ink">Remove <b>{subName}</b> from this tender? This deletes their RFQ and any quotes on record for them. This can&rsquo;t be undone.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={onClose}>Cancel</button>
              <button type="button" disabled={busy} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={() => run(() => onRemove(rfq.id))}>Remove</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Per-trade email engagement strip, driven entirely by the denormalised rfqs.* columns the recipient
// query already SELECTs (rfqs ( * )). No extra query. Events arrive via the Resend webhook:
//   delivered → email_delivered_at, opened → email_opened_at, clicked → email_clicked_at,
//   docs link clicked → docs_viewed_at, bounced/complained → bounced_at / suppressed.
// NOTE: Resend open + click tracking is opt-in per domain — opened/clicked only populate once it's
// enabled for blueleafbuilding.com.au in the Resend dashboard. Delivered/bounced work regardless.
function fmtTs(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function EngagementStrip({ rfq }) {
  const chips = [];
  if (rfq.bounced_at || rfq.suppressed) {
    const label = rfq.bounced_at ? "Bounced" : "Suppressed";
    chips.push(
      <span
        key="bad"
        title={rfq.bounced_at ? `Bounced ${fmtTs(rfq.bounced_at)}` : "Address suppressed (bounce/complaint) — won't receive mail"}
        className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"
      >
        {label}
      </span>
    );
  } else {
    if (rfq.email_delivered_at) {
      chips.push(
        <span key="del" title={`Delivered ${fmtTs(rfq.email_delivered_at)}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Delivered
        </span>
      );
    }
    if (rfq.email_opened_at) {
      // "Opened (soft)" — Resend opens rely on a tracking pixel and are easily under-reported
      // (image blocking, plain-text clients), so they are a soft signal, not proof of non-open.
      chips.push(
        <span key="open" title={`Opened ${fmtTs(rfq.email_opened_at)} — soft signal (tracking pixel, may under-report)`} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
          Opened (soft)
        </span>
      );
    }
    if (rfq.docs_viewed_at) {
      chips.push(
        <span key="docs" title={`Docs link clicked ${fmtTs(rfq.docs_viewed_at)}`} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          👁 Viewed docs
        </span>
      );
    } else if (rfq.email_clicked_at) {
      chips.push(
        <span key="click" title={`Clicked a link ${fmtTs(rfq.email_clicked_at)}`} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          Clicked
        </span>
      );
    }
  }
  if (!chips.length) return null;
  return <div className="flex flex-wrap items-center gap-1.5">{chips}</div>;
}

function isOverdue(deadline, status) {
  if (!deadline || ["received", "accepted", "declined", "not_required"].includes(status)) return false;
  const d = new Date(`${deadline}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return d < t && ["sent", "reminded"].includes(status);
}

function deadlineLabel(deadline, status) {
  if (!deadline) return "—";
  const d = new Date(`${deadline}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - today) / (24 * 60 * 60 * 1000));
  if (isOverdue(deadline, status)) return <span className="font-semibold text-danger">{Math.abs(diff)} days overdue</span>;
  if (diff === 0) return "Due today";
  return `${diff} day(s) remaining`;
}

function CorrespondenceBlock({ rfq, rows, readOnly, onLog }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <button type="button" className="text-xs font-bold uppercase tracking-wide text-primary" onClick={() => setOpen(!open)}>
        Correspondence {open ? "▼" : "▶"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 text-xs">
          {rows.length === 0 ? <p className="text-muted">No logged messages yet.</p> : null}
          {rows.map((c) => {
            const atts = Array.isArray(c.attachments) ? c.attachments : [];
            return (
              <div key={c.id} className="rounded border border-hairline bg-page p-2">
                <div className="font-semibold text-ink">{c.subject}</div>
                <div className="text-muted">{new Date(c.sent_at).toLocaleString("en-AU")}</div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] text-ink">{c.body}</pre>
                {atts.length > 0 ? (
                  <div className="mt-2 border-t border-hairline pt-2">
                    <div className="font-semibold text-muted">Attachments</div>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-[11px]">
                      {atts.map((a, i) => (
                        <li key={`${c.id}-att-${i}`}>
                          {a?.url && String(a.url).startsWith("http") ? (
                            <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                              {a.filename || "PDF"}
                            </a>
                          ) : (
                            <span>{a?.filename || "file"}</span>
                          )}
                          {typeof a?.size === "number" ? ` · ${(a.size / 1024).toFixed(1)} KB` : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!readOnly ? (
            <div className="rounded border border-dashed border-hairline p-2">
              <div className="font-semibold text-ink">Reply to {rfq.subcontractors?.business_name || "subcontractor"}</div>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Type your reply — sent to them by email, threaded to this RFQ, with your signature." className="mt-1 w-full rounded border border-hairline p-1 text-sm" />
              <button
                type="button"
                className="mt-1 rounded bg-primary px-2 py-1 text-xs font-semibold text-white"
                onClick={() => {
                  if (!reply.trim()) return;
                  onLog(rfq.id, reply.trim());
                  setReply("");
                }}
              >
                Send reply
              </button>
            </div>
          ) : null}
          {(() => {
            // Roll-up: every attachment received across this trade's correspondence,
            // newest-first, deduped — so the latest quote PDF is one click away without
            // expanding each message.
            const all = [];
            const seen = new Set();
            for (const c of rows) {
              const atts = Array.isArray(c.attachments) ? c.attachments : [];
              for (const a of atts) {
                const key = `${a?.url || a?.filename || ""}|${a?.size || ""}`;
                if (seen.has(key)) continue;
                seen.add(key);
                all.push(a);
              }
            }
            if (all.length === 0) return null;
            return (
              <div className="rounded border border-accent/40 bg-accent/5 p-2">
                <div className="font-semibold text-ink">All attachments ({all.length})</div>
                <ul className="mt-1 list-inside list-disc space-y-1 text-[11px]">
                  {all.map((a, i) => (
                    <li key={`roll-${i}`}>
                      {a?.url && String(a.url).startsWith("http") ? (
                        <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                          {a.filename || "PDF"}
                        </a>
                      ) : (
                        <span>{a?.filename || "file"}</span>
                      )}
                      {typeof a?.size === "number" ? ` · ${(a.size / 1024).toFixed(1)} KB` : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}

export default function TenderDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { setScreenContext } = useBlueprintContext() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const jobTab = searchParams.get("tab") || "tender";
  const [job, setJob] = useState(null);
  const [rfqs, setRfqs] = useState([]);
  // Step 6: the submission read model (mig 154) — rfqId → submissions[], used to group trades for
  // comparison and to surface EVERY quote a sub sent (not just the last one to land on the rfq).
  const [subView, setSubView] = useState({});
  const [submissionBusy, setSubmissionBusy] = useState({});
  const [tradeFilter, setTradeFilter] = useState("quoted"); // quoted | awaiting | awarded | all (UX redesign phase 3)
  const [editRow, setEditRow] = useState(null); // { type: "trade"|"split"|"remove", rfq } (phase 4)
  const [corr, setCorr] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scopePanelOpen, setScopePanelOpen] = useState(false);
  const [expandedScopes, setExpandedScopes] = useState({});
  const [queryRfq, setQueryRfq] = useState(null);
  const [queryBody, setQueryBody] = useState("");
  const [queryBusy, setQueryBusy] = useState(false);
  const [winMessage, setWinMessage] = useState("");
  const [lastWonProjectId, setLastWonProjectId] = useState("");
  const [winOpen, setWinOpen] = useState(false);
  const [winStep, setWinStep] = useState(1);
  const [winRows, setWinRows] = useState([]);
  const [winAlignLoading, setWinAlignLoading] = useState(false);
  const [winAlign, setWinAlign] = useState(null);
  const [winCostIntel, setWinCostIntel] = useState({
    floor_area_m2: "",
    storeys: "",
    roof_area_m2: "",
    wall_area_m2: "",
    tile_area_floor_m2: "",
    tile_area_wall_m2: "",
    solar_system_kw: "",
    wet_areas: "",
    notes: ""
  });
  const [emailPreviews, setEmailPreviews] = useState([]);
  const [loseOpen, setLoseOpen] = useState(false);
  const [losePreviews, setLosePreviews] = useState([]);
  const [feeProposals, setFeeProposals] = useState([]);
  const [reextractBusy, setReextractBusy] = useState({});
  const [batchPoTrades, setBatchPoTrades] = useState(null); // null = not checked, [] = all issued
  const [batchPoOpen, setBatchPoOpen] = useState(false);
  const [batchPoChecked, setBatchPoChecked] = useState({});
  const [batchPoProgress, setBatchPoProgress] = useState({}); // rfq_id → 'pending'|'ok'|'error'
  const [batchPoBusy, setBatchPoBusy] = useState(false);
  const [batchPoDismissed, setBatchPoDismissed] = useState(false);
  const [batchPoProjectId, setBatchPoProjectId] = useState("");
  // "Email all trade recipients" — resend the (corrected) plans link as a reply to existing RFQs.
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailRecips, setEmailRecips] = useState([]);
  const [emailSel, setEmailSel] = useState(() => new Set());
  const [emailMsg, setEmailMsg] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [emailCtx, setEmailCtx] = useState({ address: "", link: "", deadline: "" }); // template variables

  const readOnly = job?.status === "archived";

  async function resolveBatchPoProjectId(preferredId = "") {
    const pid = String(preferredId || lastWonProjectId || batchPoProjectId || "").trim();
    if (pid) return pid;
    if (!supabaseConfigured || !job?.id) return "";
    const sb = getSupabase();
    const { data } = await sb
      .from("projects")
      .select("id")
      .eq("job_id", job.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.id ? String(data.id) : "";
  }

  async function refreshBatchPoCheck(preferredProjectId = "") {
    if (!job?.id) return;
    try {
      const bpRes = await authFetch(`/api/tender/batch-po-check/${job.id}`);
      const bpj = await bpRes.json();
      if (!bpj.ok) return;
      const trades = bpj.trades || [];
      setBatchPoTrades(trades);
      if (trades.length > 0) {
        const projectId = await resolveBatchPoProjectId(preferredProjectId);
        if (projectId) setBatchPoProjectId(projectId);
        const checked = {};
        for (const t of trades) checked[t.rfq_id] = true;
        setBatchPoChecked(checked);
        setBatchPoProgress({});
        setBatchPoDismissed(false);
      }
    } catch {
      // non-critical
    }
  }

  // Submission read model (fail-soft — pre-migration it returns an empty list). Extracted so
  // step-7 verify/correction actions can refresh just the quote strip without a full reload.
  const loadSubmissions = useCallback(async () => {
    try {
      const sres = await authFetch(`/api/tender/jobs/${jobId}/submissions`);
      const sj = await sres.json().catch(() => ({}));
      const map = {};
      for (const t of sj.trades || []) for (const rec of t.recipients || []) if (rec.submissions?.length) map[rec.rfqId] = rec.submissions;
      setSubView(map);
    } catch { setSubView({}); }
  }, [jobId]);

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see Settings / Tender Manager).");
      return;
    }
    if (!jobId) {
      setError("Missing tender ID.");
      return;
    }
    const sb = getSupabase();
    const { data: j, error: jErr } = await sb
      .from("jobs")
      .select(`*, rfqs ( *, subcontractors ( id, business_name, contact, email, mobile ) )`)
      .eq("id", jobId)
      .single();
    if (jErr) {
      setError(jErr.message);
      return;
    }
    setJob(j);
    setRfqs((j.rfqs || []).slice().sort((a, b) => String(a.trade).localeCompare(String(b.trade))));
    const { data: c } = await sb.from("correspondence").select("*").eq("job_id", jobId).order("sent_at", { ascending: false });
    setCorr(c || []);
    await loadSubmissions();
    setError("");
    setScreenContext?.({
      page: "tender-detail",
      jobId: j.id,
      jobAddress: j.address || "",
      jobStatus: j.status || "",
      trades: (j.rfqs || []).map((r) => r.trade).filter(Boolean),
      clientName: j.client_name || "",
      archRef: j.arch_ref || "",
      engRef: j.eng_ref || ""
    });
  }, [jobId, setScreenContext, loadSubmissions]);

  useEffect(() => {
    load();
  }, [load]);

  const scanInbox = useCallback(async () => {
    setScanBusy(true);
    setScanResult(null);
    try {
      const res = await authFetch("/api/imap/quote-poll", { method: "POST" });
      const json = await res.json();
      const matched = json.matched ?? 0;
      setScanResult(matched > 0 ? `${matched} new reply${matched > 1 ? "s" : ""} found` : "No new replies");
      if (matched > 0) load();
    } catch {
      setScanResult("Scan failed — check server logs");
    } finally {
      setScanBusy(false);
    }
  }, [load]);

  const [backlogBusy, setBacklogBusy] = useState(false);
  const importBacklog = useCallback(async () => {
    if (!window.confirm("Import quote replies from the inbox since this job's first RFQ was sent? Safe to run more than once.")) return;
    setBacklogBusy(true);
    setScanResult(null);
    try {
      const res = await authFetch("/api/imap/quote-poll-backlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId })
      });
      const json = await res.json();
      if (!json.ok) setScanResult(json.error || "Backlog import failed");
      else {
        setScanResult(`Backlog (since ${json.since}): ${json.matched} matched, ${json.unmatched} unmatched`);
        if (json.matched > 0) load();
      }
    } catch {
      setScanResult("Backlog import failed — check server logs");
    } finally {
      setBacklogBusy(false);
    }
  }, [jobId, load]);

  const openEmailRecipients = useCallback(async () => {
    setEmailOpen(true);
    setEmailResult(null);
    setEmailLoading(true);
    try {
      const res = await authFetch(`/api/rfq/recipients/${jobId}`);
      const json = await res.json();
      const recips = json?.recipients || [];
      setEmailRecips(recips);
      setEmailSel(new Set()); // start with NONE ticked — use the quick-select chips or tick individually
      const link = json?.job?.dropboxLink || "";
      // Representative deadline for the reminder template: the most common non-null rfq deadline.
      const deadlines = (recips || []).map((r) => r.deadline).filter(Boolean);
      let deadline = "";
      if (deadlines.length) {
        const common = [...deadlines].sort((a, b) => deadlines.filter((v) => v === a).length - deadlines.filter((v) => v === b).length).pop();
        try { deadline = new Date(`${common}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { deadline = common; }
      }
      const ctx = { address: json?.job?.address || "", link, deadline };
      setEmailCtx(ctx);
      setEmailMsg(EMAIL_TEMPLATES[0].build(ctx)); // default to the "Updated plans" template
    } catch {
      setEmailResult({ error: "Could not load recipients." });
    } finally {
      setEmailLoading(false);
    }
  }, [jobId]);

  const toggleRfqSel = (rfqId) =>
    setEmailSel((prev) => {
      const n = new Set(prev);
      if (n.has(rfqId)) n.delete(rfqId);
      else n.add(rfqId);
      return n;
    });
  const toggleTradeSel = (trade, on) =>
    setEmailSel((prev) => {
      const n = new Set(prev);
      for (const r of emailRecips) if (r.trade === trade) on ? n.add(r.rfqId) : n.delete(r.rfqId);
      return n;
    });

  const sendEmailRecipients = useCallback(async () => {
    const rfqIds = [...emailSel];
    if (rfqIds.length === 0) { setEmailResult({ error: "Select at least one recipient." }); return; }
    if (!emailMsg.trim()) { setEmailResult({ error: "Message can't be empty." }); return; }
    setEmailBusy(true);
    setEmailResult(null);
    try {
      const res = await authFetch("/api/rfq/notify-recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, rfqIds, message: emailMsg })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) setEmailResult({ error: json?.error || "Send failed." });
      else { setEmailResult({ sent: json.sent, total: json.total }); load(); }
    } catch (e) {
      setEmailResult({ error: e?.message || "Send failed." });
    } finally {
      setEmailBusy(false);
    }
  }, [emailSel, emailMsg, jobId, load]);

  // Quick-select chips for the email modal — mirror the tender filters. Each chip selects exactly
  // that category's recipients (category derived from the main rfqs by rfqId).
  const emailCatChips = useMemo(() => {
    const byCat = { awaiting: [], quoted: [], awarded: [] };
    for (const rec of emailRecips) {
      const rfq = rfqs.find((x) => x.id === rec.rfqId);
      const c = rfq ? catOf(rfq) : "awaiting";
      (byCat[c] || byCat.awaiting).push(rec.rfqId);
    }
    return [
      { id: "awaiting", label: "Awaiting", ids: byCat.awaiting },
      { id: "quoted", label: "Quoted", ids: [...byCat.quoted, ...byCat.awarded] },
      { id: "awarded", label: "Awarded", ids: byCat.awarded },
      { id: "all", label: "All trades", ids: emailRecips.map((r) => r.rfqId) },
    ];
  }, [emailRecips, rfqs, catOf]);

  useEffect(() => {
    if (!job?.id || jobTab !== "fee-proposal") return;
    let stop = false;
    (async () => {
      const sb = getSupabase();
      const { data, error: fe } = await sb
        .from("fee_proposals")
        .select("id,status,quote_number,updated_at")
        .eq("job_id", job.id)
        .order("updated_at", { ascending: false });
      if (!stop && !fe) setFeeProposals(data || []);
      else if (!stop && fe) setFeeProposals([]);
    })();
    return () => {
      stop = true;
    };
  }, [job?.id, jobTab]);

  const dropboxUrl = useMemo(
    () => String(job?.dropbox_shared_link || job?.dropbox_link || "").trim(),
    [job]
  );

  const sigFooter = useMemo(() => formatSignatureFooter(loadEmailSignature()), []);

  // --- Add RFQ recipient (new sub on an existing trade) — auto-fills from the same trade's RFQ ---
  const [addOpen, setAddOpen] = useState(false);
  const [addSubs, setAddSubs] = useState([]);
  const [addTrade, setAddTrade] = useState("");
  const [addSubId, setAddSubId] = useState("");
  const [addSubject, setAddSubject] = useState("");
  const [addBody, setAddBody] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addResult, setAddResult] = useState(null);
  const [addMode, setAddMode] = useState("recipient");   // "recipient" (add a sub to a trade) | "trade" (add a missed trade)

  const existingTrades = useMemo(
    () => [...new Set(rfqs.map((r) => r.trade).filter(Boolean))],
    [rfqs]
  );

  // ── Step 6: group the trade cards for side-by-side comparison ──────────────
  // rfqs arrive sorted by trade, so a header is emitted before each trade's first card.
  // The "current" amount prefers the submission read model, falling back to the legacy columns.
  const amountOfRfq = useCallback((x) => {
    const cur = (subView[x.id] || []).find((s) => s.isCurrent && s.amountExGst != null);
    if (cur) return Number(cur.amountExGst);
    const legacy = x.quote_amount ?? x.quoted_amount;
    return legacy != null ? Number(legacy) : null;
  }, [subView]);
  const tradeGroups = useMemo(() => {
    const m = new Map();
    for (const r of rfqs) { const t = r.trade || "(untraded)"; if (!m.has(t)) m.set(t, []); m.get(t).push(r); }
    return m;
  }, [rfqs]);
  // ── UX redesign phase 3: category per recipient + filtered view + summary ──
  const catOf = useCallback((r) => {
    if (r.status === "accepted" || r.accepted_submission_id) return "awarded";
    const hasQuote = (subView[r.id]?.length > 0)
      || (r.quote_amount != null && Number(r.quote_amount) > 0)
      || (r.quoted_amount != null && Number(r.quoted_amount) > 0);
    return hasQuote ? "quoted" : "awaiting";
  }, [subView]);
  const matchesFilter = useCallback((r) => {
    if (tradeFilter === "all") return true;
    const c = catOf(r);
    if (tradeFilter === "quoted") return c === "quoted" || c === "awarded"; // "has a quote"
    return c === tradeFilter;                                                // awaiting | awarded
  }, [tradeFilter, catOf]);
  const visibleRfqs = useMemo(() => rfqs.filter(matchesFilter), [rfqs, matchesFilter]);
  const visibleFirstOfTrade = useMemo(() => {
    const s = new Set(); const seen = new Set();
    for (const r of visibleRfqs) { const t = r.trade || "(untraded)"; if (!seen.has(t)) { seen.add(t); s.add(r.id); } }
    return s;
  }, [visibleRfqs]);
  const tenderSummary = useMemo(() => {
    const trades = new Set(rfqs.map((r) => r.trade || "(untraded)")).size;
    let quoted = 0, awaiting = 0, awarded = 0, committed = 0, verified = 0;
    for (const r of rfqs) {
      const c = catOf(r);
      if (c === "awarded") { awarded++; const a = amountOfRfq(r); if (a != null && Number.isFinite(a)) committed += a; }
      else if (c === "quoted") quoted++;
      else awaiting++;
      verified += (subView[r.id] || []).filter((s) => s.isVerified).length;
    }
    return { trades, quoted, awaiting, awarded, committed, verified, quotedTotal: quoted + awarded };
  }, [rfqs, catOf, subView, amountOfRfq]);

  // Trades from the master list that aren't on this job yet — the "missed in the RFQ engine" set.
  const tnorm = (t) => String(t || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
  const existingTradesNorm = useMemo(() => new Set(existingTrades.map(tnorm)), [existingTrades]);
  const missedTrades = useMemo(
    () => RFQ_TRADE_ORDER.filter((t) => !existingTradesNorm.has(tnorm(t)) && !existingTradesNorm.has(tnorm(TRADE_LABEL[t] || t))),
    [existingTradesNorm]
  );

  // The chosen trade's subcontractors (surfaced first in the picker), then everyone else.
  const addMatchedSubs = useMemo(() => (addTrade ? subcontractorsForTrade(addTrade, addSubs, 9999) : []), [addTrade, addSubs]);
  const addMatchedIds = useMemo(() => new Set(addMatchedSubs.map((s) => String(s.id))), [addMatchedSubs]);
  const addOtherSubs = useMemo(() => addSubs.filter((s) => !addMatchedIds.has(String(s.id))), [addSubs, addMatchedIds]);

  // Copy the most recent RFQ sent for this trade, swap the salutation to the new sub, and refresh
  // the project documents link — "a slightly modified version with the correct update link".
  const buildPrefill = useCallback((trade, sub) => {
    const contact = (sub?.contact || "there").trim();
    const prior = rfqs
      .filter((r) => r.trade === trade && (r.email_body || r.email_subject))
      .sort((a, b) => String(b.sent_at || "").localeCompare(String(a.sent_at || "")))[0];
    let subject = prior?.email_subject || `RFQ — ${TRADE_LABEL[trade] || trade} — ${job?.address || ""}`.trim();
    let body = (prior?.email_body || "").replace(/^Subject:.*\n+/i, "");
    if (body) {
      body = body.replace(/^\s*(hi|hello|dear)\b[^\n]*/i, `Hi ${contact},`);
      if (dropboxUrl) {
        if (/https?:\/\/(www\.)?dropbox\.com\/\S+/i.test(body)) body = body.replace(/https?:\/\/(www\.)?dropbox\.com\/\S+/gi, dropboxUrl);
        else body += `\n\nProject documents: ${dropboxUrl}`;
      }
    } else {
      body = `Hi ${contact},\n\nWe'd like to invite ${sub?.business_name || "you"} to quote the ${TRADE_LABEL[trade] || trade} works at ${job?.address || "our project"}.${dropboxUrl ? `\n\nProject documents: ${dropboxUrl}` : ""}${sigFooter ? `\n\n${sigFooter}` : "\n\nKind regards,\nBlue Leaf Building"}`;
    }
    return { subject, body };
  }, [rfqs, job, dropboxUrl, sigFooter]);

  // Open the add modal. mode "recipient" = add a subcontractor to one of this job's trades;
  // mode "trade" = add a trade that was missed in the RFQ engine. presetTrade pins the trade
  // (used by a trade card's "+ sub"). Both send via /api/rfq/add-recipient.
  const openAdd = useCallback(async (mode = "recipient", presetTrade = "") => {
    setAddResult(null);
    setAddMode(mode);
    setAddOpen(true);
    setAddTrade(presetTrade || (mode === "recipient" ? (existingTrades[0] || "") : ""));
    setAddSubId(""); setAddSubject(""); setAddBody("");
    if (!addSubs.length) {
      const sb = getSupabase();
      if (sb) {
        // trade is needed to filter the picker to the trade's subcontractors.
        const { data } = await sb.from("subcontractors").select("id, business_name, contact, email, trade").order("business_name");
        setAddSubs(data || []);
      }
    }
  }, [existingTrades, addSubs.length]);

  const reprefill = useCallback((trade, subId) => {
    const sub = addSubs.find((s) => String(s.id) === String(subId));
    if (sub && trade) { const { subject, body } = buildPrefill(trade, sub); setAddSubject(subject); setAddBody(body); }
  }, [addSubs, buildPrefill]);

  const sendAddRecipient = useCallback(async () => {
    if (!addTrade || !addSubId) { setAddResult({ error: "Pick a trade and a subcontractor." }); return; }
    if (!addSubject.trim() || !addBody.trim()) { setAddResult({ error: "Subject and message can't be empty." }); return; }
    setAddBusy(true); setAddResult(null);
    try {
      const res = await authFetch("/api/rfq/add-recipient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, trade: addTrade, subcontractorId: addSubId, subject: addSubject, body: addBody })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) setAddResult({ error: json?.error || "Send failed." });
      else { setAddResult({ sent: json.recipient }); setAddSubId(""); setAddSubject(""); setAddBody(""); load(); }
    } catch (e) {
      setAddResult({ error: e?.message || "Send failed." });
    } finally {
      setAddBusy(false);
    }
  }, [addTrade, addSubId, addSubject, addBody, jobId, load]);

function buildWinRowsFromRfqs(list) {
  return list.map((r) => ({
    id: r.id,
    trade: r.trade,
    sub: r.subcontractors,
    quote_pdf_path: r.quote_pdf_path || "",
    status:
      r.status === "received" || r.status === "accepted"
        ? "accepted"
        : r.status === "declined"
          ? "declined"
          : "declined",
    quote_amount: r.quote_amount ?? "",
    quoted_amount: r.quoted_amount ?? null,
    received: r.status === "received" || r.status === "accepted"
  }));
}

function confirmedQuoteAmount(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function winRowMissingConfirmedQuote(row) {
  if (row.status !== "accepted") return false;
  return confirmedQuoteAmount(row.quote_amount) == null;
}

  async function archiveJob() {
    if (!job || readOnly) return;
    if (!window.confirm("Archive this tender? It becomes read-only.")) return;
    const sb = getSupabase();
    setBusy(true);
    try {
      const { error: u } = await sb.from("jobs").update({ status: "archived" }).eq("id", job.id);
      if (u) throw new Error(u.message);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateRfq(id, patch) {
    if (readOnly) return;
    const res = await authFetch(`/api/rfq/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) setError(data.error || "Could not update RFQ.");
    else await load();
  }

  // ── Step 7: verify / correct a quote submission (the Cost-Intelligence gate) ──
  async function patchSubmission(subId, patch) {
    if (readOnly) return;
    setSubmissionBusy((p) => ({ ...p, [subId]: true }));
    try {
      const res = await authFetch(`/api/tender/submissions/${encodeURIComponent(subId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error || "Could not update the quote.");
      else await loadSubmissions();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmissionBusy((p) => ({ ...p, [subId]: false }));
    }
  }

  async function setPrimaryAttachment(attId, subId) {
    if (readOnly) return;
    setSubmissionBusy((p) => ({ ...p, [subId]: true }));
    try {
      const res = await authFetch(`/api/tender/attachments/${encodeURIComponent(attId)}/primary`, { method: "PATCH" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error || "Could not set the primary file.");
      else await loadSubmissions();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmissionBusy((p) => ({ ...p, [subId]: false }));
    }
  }

  // ── Step 8: award a specific quote (sets rfqs.accepted_submission_id) / un-award ──
  async function awardSubmission(rfqId, submissionId) {
    if (readOnly) return;
    setSubmissionBusy((p) => ({ ...p, [submissionId]: true }));
    try {
      const res = await authFetch(`/api/tender/rfqs/${encodeURIComponent(rfqId)}/award`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error || "Could not award the quote.");
      else await load(); // refresh rfq status + the award pointer + submissions
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmissionBusy((p) => ({ ...p, [submissionId]: false }));
    }
  }

  async function unawardRfq(rfqId) {
    if (readOnly) return;
    try {
      const res = await authFetch(`/api/tender/rfqs/${encodeURIComponent(rfqId)}/unaward`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error || "Could not un-accept the quote.");
      else await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // ── Phase 4: recipient correction controls ──
  async function changeRfqTrade(rfqId, trade) {
    if (readOnly) return;
    const res = await authFetch(`/api/tender/rfqs/${encodeURIComponent(rfqId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trade }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) setError(data.error || "Could not change the trade.");
    else await load();
  }
  async function removeRecipient(rfqId) {
    if (readOnly) return;
    const res = await authFetch(`/api/tender/rfqs/${encodeURIComponent(rfqId)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) setError(data.error || "Could not remove the recipient.");
    else await load();
  }

  // Shared row-action bundle — one source for the desktop comparison table AND the mobile card ⋯ menu.
  const rowActions = {
    patch: patchSubmission,
    award: awardSubmission,
    unaward: unawardRfq,
    updateRfq,
    toggleAccept,
    decline: (id) => updateRfq(id, { status: "declined" }),
    query: (rr) => { setQueryRfq(rr); setQueryBody(""); },
    addSub: (trade) => openAdd("recipient", trade),
    changeTrade: (rr) => setEditRow({ type: "trade", rfq: rr }),
    split: (rr) => setEditRow({ type: "split", rfq: rr }),
    remove: (rr) => setEditRow({ type: "remove", rfq: rr }),
  };

  // The card-level Accept awards the CURRENT submission through the new pointer; a legacy rfq with
  // no submissions falls back to the old invitation-status flip so nothing regresses mid-cutover.
  function toggleAccept(r) {
    const subs = subView[r.id] || [];
    if (r.status === "accepted") {
      if (r.accepted_submission_id || subs.length) unawardRfq(r.id);
      else updateRfq(r.id, { status: "received" });
    } else {
      const cur = subs.find((s) => s.isCurrent) || subs[0];
      if (cur) awardSubmission(r.id, cur.id);
      else updateRfq(r.id, { status: "accepted" });
    }
  }

  async function reextractAmount(rfqId) {
    setReextractBusy((p) => ({ ...p, [rfqId]: true }));
    try {
      const res = await authFetch(`/api/rfq/${rfqId}/reextract-amount`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Re-extraction failed.");
      } else {
        await load();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setReextractBusy((p) => ({ ...p, [rfqId]: false }));
    }
  }

  // Send a real reply to the subcontractor, threaded to their RFQ (subject "Re: …"), with the
  // settings signature appended. Reuses /api/rfq/send (force:true to bypass the already-sent guard);
  // the server stamps the token + logs it as outbound correspondence, so no manual insert needed.
  async function logReply(rfqId, body) {
    const r = rfqs.find((x) => x.id === rfqId);
    const to = r?.subcontractors?.email;
    if (!to) { setError("That subcontractor has no email address on file."); return; }
    const subject = `Re: RFQ — ${r.trade || ""} — ${job?.address || ""}`.replace(/\s+—\s*$/, "").trim();
    const fullBody = sigFooter ? `${body}\n\n${sigFooter}` : body;
    try {
      const res = await authFetch("/api/rfq/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, messages: [{ to, subject, body: fullBody, html: plainBodyToHtml(fullBody), rfqId, jobId, subcontractor_id: r?.subcontractor_id || null }] })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) { setError(json?.error || "Reply failed to send."); return; }
      await load();
    } catch (e) {
      setError(e?.message || "Reply failed to send.");
    }
  }

  async function openWin() {
    setWinRows(buildWinRowsFromRfqs(rfqs));
    setWinCostIntel({
      floor_area_m2:
        job?.floor_area_m2 != null
          ? String(job.floor_area_m2)
          : job?.slab_area_m2 != null
            ? String(job.slab_area_m2)
            : "",
      storeys: job?.storeys != null ? String(job.storeys) : "",
      roof_area_m2: job?.roof_area_m2 != null ? String(job.roof_area_m2) : "",
      wall_area_m2: "",
      tile_area_floor_m2: "",
      tile_area_wall_m2: "",
      solar_system_kw: "",
      wet_areas: "",
      notes: ""
    });
    setWinStep(1);
    setWinAlign(null);
    setWinOpen(true);
    setWinAlignLoading(true);
    try {
      const res = await authFetch(`/api/tender/${encodeURIComponent(jobId)}/accept-alignment`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setWinAlign(data);
    } catch (e) {
      console.warn("[win-alignment]", e?.message || e);
    } finally {
      setWinAlignLoading(false);
    }
  }

  function selectAllReceived() {
    setWinRows((rows) => rows.map((row) => (row.received ? { ...row, status: "accepted" } : row)));
  }

  function winStep1Valid() {
    return winRows.every((w) => ["accepted", "declined", "not_required"].includes(w.status));
  }

  function buildEmailPreviewsAndGoStep3() {
    const addr = job?.address || "";
    const previews = [];
    const sig = loadEmailSignature();
    const logo = String(sig.logoDataUrl || "").trim();
    for (const w of winRows) {
      const sub = w.sub;
      const name = (sub?.contact || "there").trim();
      const trade = w.trade || "works";
      if (w.status === "accepted") {
        const body = `Hi ${name},\n\nGreat news — we've been awarded the project at ${addr} and we'd love to proceed with your quote for the ${trade} package.\n\nWe'll be in touch shortly with a formal Purchase Order along with a tentative commencement date for the project. Please note you'll be advised of specific dates closer to the start.\n\nReally looking forward to working together on this one.\n\n${sigFooter}`;
        previews.push({
          kind: "accepted",
          rfq_id: w.id,
          subcontractor_id: sub?.id,
          to: sub?.email,
          trade,
          businessName: sub?.business_name,
          subject: `Great news — ${addr} — ${trade}`,
          body,
          html: logo ? plainBodyToHtml(body, logo) : undefined
        });
      } else if (w.status === "declined") {
        const body = `Hi ${name},\n\nGood news on our end — we've been awarded ${addr}. On this occasion we've gone with another contractor for the ${trade} package, but I genuinely appreciate the time and effort that goes into pricing a job like this.\n\nWe've got more coming through the pipeline and you'll be hearing from us again.\n\n${sigFooter}`;
        previews.push({
          kind: "declined",
          rfq_id: w.id,
          subcontractor_id: sub?.id,
          to: sub?.email,
          trade,
          businessName: sub?.business_name,
          subject: `Update on ${addr} — ${trade}`,
          body,
          html: logo ? plainBodyToHtml(body, logo) : undefined
        });
      }
    }
    setEmailPreviews(previews);
    setWinStep(3);
  }

  async function executeWin() {
    setBusy(true);
    setError("");
    try {
      const rfqUpdates = winRows.map((w) => ({
        id: w.id,
        status: w.status,
        quote_amount: w.quote_amount === "" ? null : Number(w.quote_amount)
      }));
      const acceptedTrades = winRows
        .filter((w) => w.status === "accepted")
        .map((w) => ({
          trade: w.trade,
          subcontractor: w.sub?.business_name,
          contact: w.sub?.contact,
          email: w.sub?.email,
          phone: w.sub?.mobile,
          quote_amount: w.quote_amount === "" ? null : Number(w.quote_amount),
          subcontractor_id: w.sub?.id,
          rfq_id: w.id
        }));
      const quoteCopies = [];
      const root = sharedJobDropboxRootPath(job.address);
      for (const w of winRows) {
        const path = String(w.quote_pdf_path || "").trim();
        if (!path.startsWith("/")) continue;
        quoteCopies.push({
          fromPath: path,
          accepted: w.status === "accepted",
          trade: w.trade,
          businessName: w.sub?.business_name || "SUB",
          sharedJobRoot: root
        });
      }

      const mailPayload = emailPreviews
        .filter((m) => (m.to || "").trim())
        .map((m) => ({
          to: m.to.trim(),
          subject: m.subject,
          body: m.body,
          html: m.html,
          rfq_id: m.rfq_id,
          subcontractor_id: m.subcontractor_id,
          trade: m.trade,
          businessName: m.businessName || "SUB",
          tag: m.kind === "accepted" ? "WIN-ACCEPT" : "WIN-DECLINE"
        }));

      const fin = await authFetch("/api/tender/win-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          rfqUpdates,
          acceptedTrades,
          quoteCopies,
          tentative_start_date: null,
          emails: [],
          costIntel: winCostIntel
        })
      });
      const fj = await fin.json();
      if (!fin.ok || !fj.ok) throw new Error(fj.error || "Win finalize failed");

      if (mailPayload.length) {
        const mr = await authFetch("/api/tender/outcome-mails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, jobAddress: job.address, entries: mailPayload })
        });
        const mj = await mr.json();
        if (!mr.ok || !mj.ok) throw new Error(mj.error || "Outcome emails failed");
      }

      setWinOpen(false);
      await load();
      if (fj.project?.id) {
        setLastWonProjectId(fj.project.id);
        setBatchPoProjectId(fj.project.id);
        setWinMessage("Tender marked won. Project created in Operations.");
      }
      await refreshBatchPoCheck(fj.project?.id || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function openLose() {
    const previews = [];
    const addr = job?.address || "";
    const sig = loadEmailSignature();
    const logo = String(sig.logoDataUrl || "").trim();
    for (const r of rfqs) {
      if (r.status !== "received" && r.status !== "accepted") continue;
      const sub = r.subcontractors;
      const name = (sub?.contact || "there").trim();
      const trade = r.trade || "works";
      const body = `Hi ${name},\n\nI wanted to reach out personally — unfortunately we were unsuccessful on the tender for ${addr}.\n\nI know how much time and effort goes into pricing a job properly, and I genuinely appreciate you taking the time to put a number together for us. It doesn't go unnoticed.\n\nWe've got more work coming and I'll be in touch when the next one lands.\n\nThanks again,\n${sigFooter}`;
      previews.push({
        rfq_id: r.id,
        subcontractor_id: sub?.id,
        to: sub?.email,
        trade,
        businessName: sub?.business_name,
        subject: `Tender outcome — ${addr}`,
        body,
        html: logo ? plainBodyToHtml(body, logo) : undefined
      });
    }
    setLosePreviews(previews);
    setLoseOpen(true);
  }

  async function executeLose() {
    setBusy(true);
    setError("");
    try {
      const entries = losePreviews
        .filter((m) => (m.to || "").trim())
        .map((m) => ({
          to: m.to.trim(),
          subject: m.subject,
          body: m.body,
          html: m.html,
          rfq_id: m.rfq_id,
          subcontractor_id: m.subcontractor_id,
          trade: m.trade,
          businessName: m.businessName || "SUB",
          tag: "LOST"
        }));
      if (entries.length) {
        const mr = await authFetch("/api/tender/outcome-mails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, jobAddress: job.address, entries })
        });
        const mj = await mr.json();
        if (!mr.ok || !mj.ok) throw new Error(mj.error || "Mail failed");
      }
      const lr = await authFetch("/api/tender/lose-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, emails: [] })
      });
      const lj = await lr.json();
      if (!lr.ok || !lj.ok) throw new Error(lj.error || "Lose finalize failed");
      setLoseOpen(false);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function issueBatchPos() {
    if (!batchPoTrades?.length) return;
    setBatchPoBusy(true);
    const selected = batchPoTrades.filter(t => batchPoChecked[t.rfq_id]);
    const progress = {};
    for (const t of selected) progress[t.rfq_id] = "pending";
    setBatchPoProgress({ ...progress });

    const projectId = await resolveBatchPoProjectId();

    for (const t of selected) {
      try {
        const res = await authFetch("/api/po/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            jobAddress: job?.address || "",
            trade: t.trade,
            toEmail: t.email,
            contactName: t.contact,
            subcontractorId: t.subcontractor_id,
            rfqId: t.rfq_id,
            jobId: job?.id || "",
            totalExGst: t.total_amount,
            tentative_start_date: job?.tentative_start_date || null,
          })
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error || "Failed");
        progress[t.rfq_id] = "ok";
      } catch {
        progress[t.rfq_id] = "error";
      }
      setBatchPoProgress({ ...progress });
    }

    await refreshBatchPoCheck(projectId);

    setBatchPoBusy(false);
  }

  async function draftQuery() {
    if (!queryRfq) return;
    setQueryBusy(true);
    try {
      const res = await authFetch("/api/tender/query-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: job?.address, trade: queryRfq.trade, context: "" })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Draft failed");
      setQueryBody(j.body || "");
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setQueryBusy(false);
    }
  }

  async function sendQuery() {
    if (!queryRfq) return;
    const sub = queryRfq.subcontractors;
    const to = (sub?.email || "").trim();
    if (!to) {
      setError("Subcontractor email missing.");
      return;
    }
    const subject = `RE: Quote Request – ${job?.address} – ${queryRfq.trade}`;
    setQueryBusy(true);
    try {
      const sig = loadEmailSignature();
      const footer = formatSignatureFooter(sig);
      const fullText = `${queryBody}\n\n${footer}`.trim();
      const html = sig.logoDataUrl ? plainBodyToHtml(fullText, sig.logoDataUrl) : undefined;
      const res = await authFetch("/api/rfq/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A query is an intentional follow-up — bypass the "already sent" idempotency guard, which
          // would otherwise silently skip it (the rfq is already status='sent' by the time you query).
          force: true,
          messages: [
            {
              to,
              subject,
              body: fullText,
              html,
              rfqId: queryRfq.id,
              jobId,
              subcontractor_id: queryRfq.subcontractor_id
            }
          ]
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Send failed");
      // Never swallow a skip as success — if the send was skipped, tell the user instead of logging
      // a phantom "sent" row.
      if (j?.results?.some((r) => r?.skipped)) {
        throw new Error("Send was skipped (this subcontractor already has a sent RFQ for this job). Reload and try again.");
      }
      // /api/rfq/send already logs correspondence WITH the real message_id AND captures
      // resend_email_id (engagement tracking) whenever it has the rfqId — which the query always
      // passes. Only fall back to a client-side log if the server didn't, so we never write a
      // duplicate, message-id-less "sent" row (that orphaned row is what made past query sends look
      // like they never went through Resend).
      const serverLogged = Boolean(j?.results?.some((r) => r?.serverLogged));
      if (!serverLogged) {
        const sb = getSupabase();
        await sb.from("correspondence").insert({
          job_id: jobId,
          rfq_id: queryRfq.id,
          subcontractor_id: queryRfq.subcontractor_id,
          direction: "outbound",
          subject,
          body: fullText,
          logged_by: "sam"
        });
      }
      setQueryRfq(null);
      setQueryBody("");
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setQueryBusy(false);
    }
  }

  if (!job) {
    return (
      <div className="text-sm text-muted">
        {error || "Loading…"}{" "}
        <Link to="/tender-manager/board" className="font-semibold text-accent underline">
          Back
        </Link>
      </div>
    );
  }

  const badge = JOB_STATUS_BADGE[job.status] || JOB_STATUS_BADGE.tendering;
  const acceptedN = winRows.filter((w) => w.status === "accepted").length;
  const declinedN = winRows.filter((w) => w.status === "declined").length;
  const nrN = winRows.filter((w) => w.status === "not_required").length;
  const winQuoteAmountWarnings = winRows.filter(winRowMissingConfirmedQuote);

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link to="/tender-manager/board" className="font-semibold text-accent underline">
          ← Tenders
        </Link>
        <Link to="/tender-manager/rfq-engine" className="text-muted underline">
          RFQ Engine
        </Link>
      </div>

      <header className="space-y-4 rounded-card border border-hairline bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary md:text-3xl">{job.address}</h1>
            <p className="mt-1 text-xs text-muted">Created {new Date(job.created_at).toLocaleString("en-AU")}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${badge.cls}`}>{badge.label}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {dropboxUrl ? (
            <a
              href={dropboxUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-primary hover:bg-surface"
            >
              Dropbox folder
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set("tab", "tender");
              setSearchParams(p, { replace: true });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${jobTab === "tender" ? "bg-primary text-white" : "border border-hairline text-ink"}`}
          >
            Tender
          </button>
          <button
            type="button"
            onClick={() => {
              const p = new URLSearchParams(searchParams);
              p.set("tab", "fee-proposal");
              setSearchParams(p, { replace: true });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${jobTab === "fee-proposal" ? "bg-primary text-white" : "border border-hairline text-ink"}`}
          >
            Fee Proposal
          </button>
          {!readOnly && job.status === "tendering" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={openWin}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Mark as won
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={openLose}
                className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Mark as lost
              </button>
            </>
          ) : null}
          {!readOnly && (job.status === "won" || job.status === "lost") ? (
            <button
              type="button"
              disabled={busy}
              onClick={archiveJob}
              className="rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink"
            >
              Archive
            </button>
          ) : null}
        </div>
      </header>

      {/* Project summary strip */}
      {(() => {
        const ex = job.extracted_data || {};
        const pills = [
          ex.project_type && { label: ex.project_type },
          ex.storeys && { label: `${ex.storeys} ${Number(ex.storeys) === 1 ? "storey" : "storeys"}` },
          ex.floor_area_m2 && { label: `${ex.floor_area_m2} m² GFA` },
        ].filter(Boolean);
        if (!ex.key_project_notes?.trim() && !pills.length) return null;
        return (
          <div className="rounded-card border border-hairline bg-page px-5 py-4 shadow-sm">
            {ex.key_project_notes?.trim() ? (
              <p className="mb-2.5 text-sm leading-relaxed text-ink">{ex.key_project_notes.trim()}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {pills.map((p, i) => (
                <span key={i} className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-ink">
                  {p.label}
                </span>
              ))}
              <button
                type="button"
                onClick={() => setScopePanelOpen(true)}
                className="ml-auto text-xs font-semibold text-primary hover:underline"
              >
                Full scope →
              </button>
            </div>
          </div>
        );
      })()}

      {winMessage ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
          {winMessage}{" "}
          {lastWonProjectId ? (
            <Link to={`/operations/${lastWonProjectId}`} className="font-semibold underline">
              View operations setup checklist →
            </Link>
          ) : null}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setWinMessage("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">{error}</div> : null}

      {/* Batch PO banner — shown when accepted trades have no PO yet */}
      {batchPoTrades && batchPoTrades.length > 0 && !batchPoDismissed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          <div>
            <span className="font-semibold text-primary">✅ Tender won — {job?.address}</span>
            <span className="ml-2 text-ink">{batchPoTrades.length} accepted trade{batchPoTrades.length !== 1 ? "s" : ""} ready for PO issue.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBatchPoOpen(true)}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white"
            >
              Issue all POs →
            </button>
            <button
              type="button"
              onClick={() => setBatchPoDismissed(true)}
              className="text-xs text-muted hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* Batch PO slide-up sheet */}
      {batchPoOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => { if (!batchPoBusy) setBatchPoOpen(false); }}>
          <div className="w-full max-w-2xl rounded-t-2xl bg-surface p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">Issue Purchase Orders — {job?.address}</h3>
              {!batchPoBusy && (
                <button type="button" onClick={() => setBatchPoOpen(false)} className="text-muted hover:text-ink text-lg">✕</button>
              )}
            </div>
            <div className="mb-4 space-y-2 max-h-72 overflow-y-auto">
              {batchPoTrades.map(t => {
                const prog = batchPoProgress[t.rfq_id];
                return (
                  <div key={t.rfq_id} className="flex items-center gap-3 rounded-lg border border-hairline bg-page px-4 py-3">
                    <input
                      type="checkbox"
                      disabled={batchPoBusy || prog === "ok"}
                      checked={!!batchPoChecked[t.rfq_id]}
                      onChange={e => setBatchPoChecked(prev => ({ ...prev, [t.rfq_id]: e.target.checked }))}
                      className="h-4 w-4 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-ink truncate">{t.trade}</p>
                      <p className="text-xs text-muted truncate">{t.business_name}{t.email ? ` · ${t.email}` : " · ⚠ no email"}</p>
                    </div>
                    <span className="text-sm text-muted font-mono">${(t.total_amount || 0).toLocaleString("en-AU", { minimumFractionDigits: 0 })}</span>
                    {prog === "ok" && <span className="text-green-600 text-lg">✅</span>}
                    {prog === "error" && <span className="text-danger text-lg">❌</span>}
                    {prog === "pending" && (
                      <svg className="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(batchPoProgress).length > 0 && !batchPoBusy ? (
              <div className="mb-4 rounded-lg bg-page border border-hairline px-4 py-3 text-sm text-ink">
                {Object.values(batchPoProgress).filter(v => v === "ok").length} PO{Object.values(batchPoProgress).filter(v => v === "ok").length !== 1 ? "s" : ""} issued.{" "}
                {Object.values(batchPoProgress).filter(v => v === "error").length > 0
                  ? `${Object.values(batchPoProgress).filter(v => v === "error").length} failed — check email configuration.`
                  : ""}
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              {!batchPoBusy && (
                <button type="button" onClick={() => setBatchPoOpen(false)} className="rounded-lg border border-hairline px-4 py-2 text-sm text-ink hover:bg-page">
                  Close
                </button>
              )}
              <button
                type="button"
                disabled={batchPoBusy || !Object.entries(batchPoChecked).some(([, v]) => v) || batchPoTrades.length === 0}
                onClick={issueBatchPos}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {batchPoBusy ? "Issuing…" : `Issue ${Object.values(batchPoChecked).filter(Boolean).length} selected PO${Object.values(batchPoChecked).filter(Boolean).length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {jobTab === "fee-proposal" ? (
        <section className="space-y-4 rounded-card border border-hairline bg-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Fee proposals</h2>
            <button
              type="button"
              onClick={() => navigate(`/tender-manager/fee-proposal/new?jobId=${jobId}`)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              New fee proposal
            </button>
          </div>
          {feeProposals.length === 0 ? <p className="text-sm text-muted">No fee proposals for this job yet.</p> : null}
          <ul className="divide-y divide-hairline">
            {feeProposals.map((fp) => (
              <li key={fp.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <span className="font-mono text-xs text-muted">{fp.quote_number || fp.id.slice(0, 8)}</span>
                  <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-[10px] font-bold uppercase text-muted">{fp.status || "draft"}</span>
                </div>
                <Link to={`/tender-manager/fee-proposal/${fp.id}`} className="text-sm font-semibold text-primary underline">
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {jobTab === "tender" ? (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Trades</h2>
          <div className="flex items-center gap-2">
            {scanResult && (
              <span className="text-xs text-muted">{scanResult}</span>
            )}
            {!readOnly && job.status === "tendering" && (
              <button
                type="button"
                onClick={() => navigate(`/tender-manager/rfq-engine?jobId=${jobId}&resume=4`)}
                title="Reopen the RFQ Engine for this job at the dispatch step, with scope and recipients loaded — already-sent RFQs stay locked"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-95"
              >
                Resume RFQ Engine →
              </button>
            )}
            {!readOnly && job.status === "tendering" && (
              <button
                type="button"
                onClick={openEmailRecipients}
                title="Email the current RFQ recipients an update (e.g. the corrected plans link), threaded as a reply to their RFQ"
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/40"
              >
                ✉ Email recipients
              </button>
            )}
            {!readOnly && job.status === "tendering" && (
              <button
                type="button"
                onClick={() => openAdd("trade")}
                title="Add a trade that was missed in the RFQ engine, then send its RFQ to subcontractors"
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/40"
              >
                + Add trade
              </button>
            )}
            {!readOnly && job.status === "tendering" && (
              <button
                type="button"
                onClick={() => openAdd("recipient")}
                title="Send an RFQ to another subcontractor for one of this job's trades — the picker filters to that trade's subs and auto-fills from the existing RFQ"
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/40"
              >
                + Add subcontractor
              </button>
            )}
            <button
              type="button"
              onClick={scanInbox}
              disabled={scanBusy}
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-muted shadow-sm transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {scanBusy ? (
                <>
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/>
                    <path d="M12 3a9 9 0 019 9"/>
                  </svg>
                  Scanning…
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16v12H4z"/><path d="M8 20h8M12 16v4"/>
                  </svg>
                  Scan inbox
                </>
              )}
            </button>
            <button
              type="button"
              onClick={importBacklog}
              disabled={backlogBusy}
              title="One-time: pull quote replies that arrived BEFORE live polling started, from this job's first RFQ date onward. Safe to re-run."
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-muted shadow-sm transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {backlogBusy ? "Importing…" : "Import backlog"}
            </button>
          </div>
        </div>

        {emailOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => !emailBusy && setEmailOpen(false)}
          >
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-card border border-hairline bg-surface p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-primary">Email RFQ recipients</h3>
                <button type="button" onClick={() => setEmailOpen(false)} className="text-muted hover:text-ink">✕</button>
              </div>
              {emailLoading ? (
                <p className="mt-4 text-sm text-muted">Loading recipients…</p>
              ) : emailRecips.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No sent RFQ recipients found for this job.</p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-muted">
                    Toggle trades/recipients, then send. Each email goes as a reply to that subcontractor&apos;s original RFQ thread.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Quick select</span>
                    {emailCatChips.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={c.ids.length === 0}
                        onClick={() => setEmailSel(new Set(c.ids))}
                        className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-primary/40 hover:text-primary disabled:opacity-40"
                      >
                        {c.label} <span className="opacity-70 tabular-nums">{c.ids.length}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-b border-hairline pb-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={emailRecips.length > 0 && emailSel.size === emailRecips.length}
                        onChange={(e) => setEmailSel(e.target.checked ? new Set(emailRecips.map((r) => r.rfqId)) : new Set())}
                      />
                      Select all ({emailRecips.length})
                    </label>
                    <span className="text-xs text-muted">{emailSel.size} selected</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {[...new Set(emailRecips.map((r) => r.trade))].map((trade) => {
                      const rows = emailRecips.filter((r) => r.trade === trade);
                      const allOn = rows.every((r) => emailSel.has(r.rfqId));
                      return (
                        <div key={trade} className="rounded-lg border border-hairline bg-page p-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                            <input type="checkbox" checked={allOn} onChange={(e) => toggleTradeSel(trade, e.target.checked)} />
                            {trade}
                          </label>
                          <div className="mt-1 space-y-1 pl-5">
                            {rows.map((r) => (
                              <label key={r.rfqId} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                <input type="checkbox" checked={emailSel.has(r.rfqId)} onChange={() => toggleRfqSel(r.rfqId)} />
                                <span className="text-ink">{r.businessName || r.email}</span>
                                <span className="text-[10px]">{r.email}</span>
                                {!r.hasThread ? <span className="text-[10px] text-warning">(no thread — sends fresh)</span> : null}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase text-muted">Message</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide text-muted">Template</span>
                      {EMAIL_TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEmailMsg(t.build(emailCtx))}
                          className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-primary transition hover:bg-primary/5"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={10}
                    value={emailMsg}
                    onChange={(e) => setEmailMsg(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs font-mono leading-relaxed"
                  />
                  {emailResult?.error ? <p className="mt-2 text-xs text-danger">{emailResult.error}</p> : null}
                  {emailResult?.sent != null ? (
                    <p className="mt-2 text-xs text-success">Sent {emailResult.sent} of {emailResult.total}.</p>
                  ) : null}
                  <div className="mt-4 flex items-center justify-end gap-3">
                    <button type="button" onClick={() => setEmailOpen(false)} className="rounded-lg border border-hairline bg-page px-4 py-2 text-xs font-semibold">
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={emailBusy || emailSel.size === 0}
                      onClick={sendEmailRecipients}
                      className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-40"
                    >
                      {emailBusy ? "Sending…" : `Send to ${emailSel.size} recipient${emailSel.size === 1 ? "" : "s"}`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {addOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !addBusy && setAddOpen(false)}>
            <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-card border border-hairline bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-primary">{addMode === "trade" ? "Add a trade" : "Add a subcontractor"}</h3>
                <button type="button" onClick={() => setAddOpen(false)} className="text-muted hover:text-ink">✕</button>
              </div>
              <p className="mt-2 text-xs text-muted">
                {addMode === "trade"
                  ? "Add a trade that was missed in the RFQ engine, pick a subcontractor for it, then send. It appears on the board once sent."
                  : "Pick the trade and a subcontractor — the picker shows that trade's subs first and the email auto-fills from the existing RFQ with the current documents link. Edit if needed, then send."}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted">Trade</label>
                  <select
                    value={addTrade}
                    onChange={(e) => { setAddTrade(e.target.value); setAddSubId(""); reprefill(e.target.value, ""); }}
                    className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs"
                  >
                    <option value="">{addMode === "trade" ? "Select a trade to add…" : "Select trade…"}</option>
                    {addMode === "trade"
                      ? missedTrades.map((t) => <option key={t} value={t}>{TRADE_LABEL[t] || t}</option>)
                      : existingTrades.map((t) => <option key={t} value={t}>{TRADE_LABEL[t] || t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-muted">Subcontractor</label>
                  <select
                    value={addSubId}
                    onChange={(e) => { setAddSubId(e.target.value); reprefill(addTrade, e.target.value); }}
                    className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs"
                  >
                    <option value="">{addTrade ? "Select subcontractor…" : "Pick a trade first…"}</option>
                    {addTrade && addMatchedSubs.length > 0 && (
                      <optgroup label={`For ${TRADE_LABEL[addTrade] || addTrade}`}>
                        {addMatchedSubs.map((s) => <option key={s.id} value={s.id} disabled={!s.email}>{s.business_name}{s.email ? "" : " (no email)"}</option>)}
                      </optgroup>
                    )}
                    {addTrade && addOtherSubs.length > 0 && (
                      <optgroup label={addMatchedSubs.length > 0 ? "All other subcontractors" : "Subcontractors (none tagged to this trade)"}>
                        {addOtherSubs.map((s) => <option key={s.id} value={s.id} disabled={!s.email}>{s.business_name}{s.email ? "" : " (no email)"}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
              <label className="mt-3 block text-xs font-semibold uppercase text-muted">Subject</label>
              <input value={addSubject} onChange={(e) => setAddSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs" />
              <label className="mt-3 block text-xs font-semibold uppercase text-muted">Message</label>
              <textarea rows={11} value={addBody} onChange={(e) => setAddBody(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs font-mono leading-relaxed" />
              {addResult?.error ? <p className="mt-2 text-xs text-danger">{addResult.error}</p> : null}
              {addResult?.sent ? <p className="mt-2 text-xs text-success">RFQ sent to {addResult.sent}.</p> : null}
              <div className="mt-4 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setAddOpen(false)} className="rounded-lg border border-hairline bg-page px-4 py-2 text-xs font-semibold">Close</button>
                <button
                  type="button"
                  disabled={addBusy || !addSubId || !addTrade}
                  onClick={sendAddRecipient}
                  className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-40"
                >
                  {addBusy ? "Sending…" : "Send RFQ"}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* UX redesign phase 3 — summary + filter chips (collapses the 26-trade scroll to what matters) */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-hairline bg-page/60 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span><b className="tabular-nums">{tenderSummary.trades}</b> <span className="text-muted">trades</span></span>
            <span><b className="tabular-nums">{tenderSummary.quotedTotal}</b> <span className="text-muted">quoted</span></span>
            <span><b className="tabular-nums text-emerald-700">{tenderSummary.verified}</b> <span className="text-muted">verified</span></span>
            <span><b className="tabular-nums text-primary">{tenderSummary.awarded}</b> <span className="text-muted">awarded · ${Math.round(tenderSummary.committed).toLocaleString()} ex GST</span></span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "quoted", label: "Quoted", n: tenderSummary.quotedTotal },
            { id: "awaiting", label: "Awaiting", n: tenderSummary.awaiting },
            { id: "awarded", label: "Awarded", n: tenderSummary.awarded },
            { id: "all", label: "All trades", n: rfqs.length },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setTradeFilter(c.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${tradeFilter === c.id ? "bg-primary text-white" : "border border-hairline bg-surface text-muted hover:text-ink"}`}
            >
              {c.label} <span className="opacity-70 tabular-nums">{c.n}</span>
            </button>
          ))}
        </div>
        {visibleRfqs.length === 0 && (
          <div className="rounded-card border border-dashed border-hairline bg-page/40 px-4 py-8 text-center text-sm text-muted">
            No trades in this view.{" "}
            {tradeFilter !== "all" && (
              <button type="button" className="font-semibold text-primary underline" onClick={() => setTradeFilter("all")}>Show all trades</button>
            )}
          </div>
        )}
        {/* Desktop: dense comparison table (phase 3b). Mobile keeps the cards below. */}
        {visibleRfqs.length > 0 && (
          <div className="hidden lg:block">
            <TenderCompareTable
              rows={visibleRfqs}
              tradeGroups={tradeGroups}
              amountOfRfq={amountOfRfq}
              subView={subView}
              submissionBusy={submissionBusy}
              readOnly={readOnly}
              canAddSub={!readOnly && job.status === "tendering"}
              on={rowActions}
            />
          </div>
        )}
        {/* Mobile: the existing cards */}
        <div className="space-y-4 lg:hidden">
        {visibleRfqs.map((r) => {
          const sub = r.subcontractors;
          const vis = isOverdue(r.deadline, r.status)
            ? { label: "Overdue", cls: "bg-red-600 text-white" }
            : RFQ_STATUS_VIS[r.status] || RFQ_STATUS_VIS.sent;
          const pdfHref = String(r.quote_pdf_url || r.dropbox_pdf_url || "").trim();
          const pdfOpenUrl = pdfHref.startsWith("http") ? pdfHref : "";
          const canToggle = !readOnly && (
            (r.quote_amount != null && Number(r.quote_amount) > 0)
            || (r.quoted_amount != null && Number(r.quoted_amount) > 0)
            || (subView[r.id]?.length > 0)
          );
          // Block a double-award while a submission action for this recipient is mid-flight.
          const cardBusy = (subView[r.id] || []).some((s) => submissionBusy[s.id]);
          // ONE amount model (UX redesign phase 2): when this recipient has quote submissions, the
          // submission strip above IS the single amount surface — hide the legacy "Quote amount" box +
          // "tap to use" duplicate. The legacy box only shows for a recipient with no submission yet
          // (e.g. a manually-tracked quote), so the amount is never entered/shown in two places.
          const hasSub = (subView[r.id]?.length || 0) > 0;
          return (
            <Fragment key={r.id}>
            {/* Trade group header — the comparison summary for this trade (step 6). */}
            {visibleFirstOfTrade.has(r.id) && (() => {
              const group = tradeGroups.get(r.trade || "(untraded)") || [r];
              const priced = group.map((x) => ({ x, a: amountOfRfq(x) })).filter((o) => o.a != null).sort((p, q) => p.a - q.a);
              const low = priced[0];
              return (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page px-3 py-2">
                  <span className="text-sm font-bold text-ink">{TRADE_LABEL[r.trade] || r.trade}</span>
                  <span className="text-xs text-muted">
                    {priced.length}/{group.length} quoted
                    {low ? <> · lowest <span className="font-semibold tabular-nums text-ink">${Number(low.a).toLocaleString()}</span> — {low.x.subcontractors?.business_name || "—"}</> : null}
                  </span>
                </div>
              );
            })()}
            <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{TRADE_LABEL[r.trade] || r.trade}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${vis.cls}`}>{vis.label}</span>
                    {!readOnly && job.status === "tendering" && (
                      <button
                        type="button"
                        onClick={() => openAdd("recipient", r.trade)}
                        title={`Send this trade's RFQ to another subcontractor`}
                        className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold text-primary transition hover:border-primary/40"
                      >
                        + sub
                      </button>
                    )}
                  </div>
                  <EngagementStrip rfq={r} />
                  <div className="text-sm font-semibold text-ink">{sub?.business_name || "—"}</div>
                  <div className="text-xs text-muted">{(sub?.contact || "—") + (sub?.email ? ` · ${sub.email}` : "")}</div>
                  <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
                    <div>Sent: {r.sent_at ? new Date(r.sent_at).toLocaleDateString("en-AU") : "—"}</div>
                    <div>Deadline: {r.deadline || "—"}</div>
                    <div>{deadlineLabel(r.deadline, r.status)}</div>
                  </div>
                  {/* Every quote this sub sent (step 4 recovered them all; under one-quote-per-rfq only
                      the last one survived) + step-7 verify/correct controls. Verify → feeds Cost Intelligence. */}
                  {(subView[r.id]?.length >= 1) && (
                    <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold text-amber-800">
                          {subView[r.id].length} quote{subView[r.id].length === 1 ? "" : "s"} on record
                        </span>
                        <span className="text-[10px] text-amber-700/80">Verify to feed Cost Intelligence</span>
                      </div>
                      <div className="mt-1.5 space-y-1.5">
                        {subView[r.id].map((s) => (
                          <SubmissionRow
                            /* include the amount in the key so the editable field re-seeds if a
                               background refresh changes this submission's extracted/confirmed amount */
                            key={`${s.id}:${s.amountExGst ?? ""}`}
                            s={s}
                            rfqId={r.id}
                            busy={!!submissionBusy[s.id]}
                            readOnly={readOnly}
                            showAward={subView[r.id].length > 1 || s.isAccepted}
                            onPatch={patchSubmission}
                            onPrimary={setPrimaryAttachment}
                            onAward={awardSubmission}
                            onUnaward={unawardRfq}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex w-full max-w-md flex-col gap-2 border-t border-hairline pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  {!hasSub && (
                    <label className="text-xs font-semibold text-muted">
                      Quote amount (ex GST)
                      <input
                        type="number"
                        disabled={readOnly}
                        defaultValue={r.quote_amount ?? ""}
                        className="mt-1 w-full rounded-lg border border-hairline px-2 py-1 text-sm"
                        onBlur={(e) => {
                          if (readOnly) return;
                          const v = e.target.value;
                          if (v === String(r.quote_amount ?? "")) return;
                          updateRfq(r.id, { quote_amount: v === "" ? null : Number(v), manually_entered: true });
                        }}
                      />
                    </label>
                  )}
                  {!hasSub && r.quoted_amount != null && Number(r.quoted_amount) > 0 && r.quote_amount == null && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary"
                      title="Auto-extracted from quote PDF — click to accept"
                      onClick={() => updateRfq(r.id, { quote_amount: Number(r.quoted_amount) })}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                      Extracted: {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(r.quoted_amount)} ex GST
                      {r.quote_extraction?.total_inc_gst && (
                        <span className="text-muted font-normal">
                          {" "}({new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(r.quote_extraction.total_inc_gst)} inc GST)
                        </span>
                      )}
                      {" "}— tap to use
                    </button>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {pdfOpenUrl ? (
                      <a
                        href={pdfOpenUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-accent underline"
                      >
                        View quote PDF
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="No quote PDF received yet"
                        className="cursor-not-allowed rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted opacity-50"
                      >
                        View quote PDF
                      </button>
                    )}
                    {!hasSub && pdfOpenUrl && (r.quoted_amount == null || r.quoted_amount === 0) && (
                      <button
                        type="button"
                        disabled={reextractBusy[r.id]}
                        onClick={() => reextractAmount(r.id)}
                        title="Extract quote total from PDF using AI"
                        className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning disabled:opacity-50"
                      >
                        {reextractBusy[r.id] ? "Extracting…" : "Extract amount"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={readOnly || !canToggle || cardBusy}
                      onClick={() => toggleAccept(r)}
                      className="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
                    >
                      {r.status === "accepted" ? "Un-award" : "Award"}
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || !canToggle}
                      onClick={() => updateRfq(r.id, { status: "declined" })}
                      className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-semibold text-muted disabled:opacity-40"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setQueryRfq(r);
                        setQueryBody("");
                      }}
                      className="rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      Query
                    </button>
                    {/* Mobile ⋯ parity (matches the desktop table): change trade / split scopes / remove. */}
                    <TKebab rfq={r} readOnly={readOnly} on={rowActions} />
                  </div>
                </div>
              </div>
              <CorrespondenceBlock rfq={r} rows={corr.filter((c) => c.rfq_id === r.id)} readOnly={readOnly} onLog={logReply} />
              {(() => {
                const tradeKey = Object.keys(TRADE_LABEL).find((k) => TRADE_LABEL[k] === r.trade) || r.trade;
                const notes = coerceExtraction(job.extracted_data).trade_notes?.[tradeKey];
                const bullets = bulletsFromTradeNote(notes);
                if (!bullets.length) return null;
                const open = expandedScopes[r.id];
                return (
                  <div className="mt-3 border-t border-hairline pt-3">
                    <button
                      type="button"
                      onClick={() => setExpandedScopes((s) => ({ ...s, [r.id]: !s[r.id] }))}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    >
                      <svg className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                      {open ? "Hide" : "View"} extracted scope ({bullets.length} items)
                    </button>
                    {open && (
                      <ul className="mt-2 space-y-1 pl-4">
                        {bullets.map((b, i) => (
                          <li key={i} className="flex gap-2 text-xs text-ink">
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
            </Fragment>
          );
        })}
        </div>
      </section>
      ) : null}

      {editRow ? (
        <EditRowModal
          editRow={editRow}
          subView={subView}
          onClose={() => setEditRow(null)}
          onChangeTrade={changeRfqTrade}
          onPatchSub={patchSubmission}
          onRemove={removeRecipient}
        />
      ) : null}

      {queryRfq ? (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-black/40"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setQueryRfq(null)}
        >
          <div className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary">Reply to subcontractor</h2>
              <button type="button" className="text-muted" onClick={() => setQueryRfq(null)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">To: {(queryRfq.subcontractors?.email || "").trim()}</p>
            <p className="text-xs text-muted">
              Subject: RE: Quote Request – {job.address} – {queryRfq.trade}
            </p>
            <textarea
              value={queryBody}
              onChange={(e) => setQueryBody(e.target.value)}
              rows={14}
              className="mt-4 w-full rounded-lg border border-hairline p-3 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={queryBusy} onClick={draftQuery} className="rounded-lg bg-page px-3 py-2 text-sm font-semibold ring-1 ring-hairline">
                Draft with AI
              </button>
              <button
                type="button"
                disabled={queryBusy || !queryBody.trim()}
                onClick={sendQuery}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {winOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setWinOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {winStep === 1 ? (
              <>
                <h2 className="text-lg font-bold text-primary">Step 1 — Quote review</h2>
                <p className="mt-1 text-sm text-muted">Set outcome for every trade before continuing.</p>
                {winAlignLoading ? (
                  <p className="mt-3 text-xs text-muted">Checking quote acceptance alignment…</p>
                ) : null}
                {winQuoteAmountWarnings.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-ink">
                    <div className="font-semibold text-primary">Quote amount warning</div>
                    <p className="mt-2 text-muted">
                      Some accepted trades do not have a staff-confirmed quote amount. These trades may not be
                      recorded in cost intelligence when the tender is marked won. Confirm the quote amount before
                      finalising where possible.
                    </p>
                  </div>
                ) : null}
                {winAlign?.hasWarnings ? (
                  <div className="mt-4 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-sm text-ink">
                    <div className="font-semibold text-primary">Quote acceptance warning</div>
                    <p className="mt-2 text-muted">
                      Some accepted package quotes are not fully aligned with the Tender win path. The win wizard
                      currently uses accepted RFQs only. Cross-check Package Detail before finalising this tender as
                      won.
                    </p>
                    <ul className="mt-3 space-y-2 text-xs">
                      {winAlign.warnings.map((w) => (
                        <li key={`${w.type}-${w.recipientId || w.rfqId}-${w.trade}`} className="rounded border border-warning/40 bg-surface px-3 py-2">
                          <span className="font-semibold uppercase tracking-wide text-warning">{w.type.replace(/_/g, " ")}</span>
                          <div className="mt-1 text-muted">
                            {w.trade}
                            {w.recipientName ? ` · ${w.recipientName}` : ""}
                            {w.quoteAmount != null ? ` · $${Number(w.quoteAmount).toLocaleString("en-AU")} ex GST` : ""}
                          </div>
                          <div className="mt-1">{w.message}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button type="button" className="mt-3 text-xs font-semibold text-accent underline" onClick={selectAllReceived}>
                  Select all received quotes
                </button>
                <div className="mt-4 space-y-2">
                  {winRows.map((w) => (
                    <div key={w.id} className="grid gap-2 rounded border border-hairline bg-page p-3 text-sm md:grid-cols-3">
                      <div>
                        <div className="font-semibold">{w.trade}</div>
                        <div className="text-xs text-muted">{w.sub?.business_name}</div>
                      </div>
                      <div>
                        <label className="text-xs text-muted">Quote $</label>
                        <input
                          type="number"
                          className="w-full rounded border px-2 py-1 text-sm"
                          value={w.quote_amount}
                          onChange={(e) =>
                            setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, quote_amount: e.target.value } : r)))
                          }
                        />
                        {winRowMissingConfirmedQuote(w) ? (
                          <p className="mt-1 text-[11px] font-semibold text-warning">
                            No staff-confirmed quote amount — may not be recorded in cost intelligence.
                          </p>
                        ) : null}
                        {winRowMissingConfirmedQuote(w) &&
                        w.quoted_amount != null &&
                        Number(w.quoted_amount) > 0 ? (
                          <button
                            type="button"
                            className="mt-1 flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary"
                            title="Auto-extracted from quote PDF — click to use in this win wizard"
                            onClick={() =>
                              setWinRows((rows) =>
                                rows.map((r) =>
                                  r.id === w.id ? { ...r, quote_amount: String(w.quoted_amount) } : r
                                )
                              )
                            }
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                            Use extracted amount:{" "}
                            {new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
                              w.quoted_amount
                            )}{" "}
                            ex GST
                          </button>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 text-xs">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={w.status === "accepted"}
                            onChange={() => setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, status: "accepted" } : r)))}
                          />
                          Accepted
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={w.status === "declined"}
                            onChange={() => setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, status: "declined" } : r)))}
                          />
                          Declined
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={w.status === "not_required"}
                            onChange={() => setWinRows((rows) => rows.map((r) => (r.id === w.id ? { ...r, status: "not_required" } : r)))}
                          />
                          No quote — not required
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-lg border border-dashed border-hairline bg-page/50 p-4">
                  <h3 className="text-xs font-bold uppercase text-muted">Cost Intelligence (optional)</h3>
                  <p className="mt-1 text-[11px] text-muted">Quantities stored with each accepted quote row for $/m² analytics.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label className="text-[11px] font-semibold text-ink">
                      Floor m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.floor_area_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, floor_area_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Storeys
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.storeys}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, storeys: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Roof m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.roof_area_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, roof_area_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Wall m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.wall_area_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, wall_area_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Tile floor m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.tile_area_floor_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, tile_area_floor_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Tile wall m²
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.tile_area_wall_m2}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, tile_area_wall_m2: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Solar kW
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.solar_system_kw}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, solar_system_kw: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink">
                      Wet areas
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.wet_areas}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, wet_areas: e.target.value }))}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink sm:col-span-3">
                      Notes
                      <input
                        className="mt-0.5 w-full rounded border px-2 py-1 text-sm"
                        value={winCostIntel.notes}
                        onChange={(e) => setWinCostIntel((c) => ({ ...c, notes: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={() => setWinOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    disabled={!winStep1Valid()}
                    onClick={() => setWinStep(2)}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : null}
            {winStep === 2 ? (
              <>
                <h2 className="text-lg font-bold text-primary">Step 2 — Confirm</h2>
                <p className="mt-2 text-sm text-ink">
                  You are marking <strong>{job.address}</strong> as WON.
                  <br />
                  {acceptedN} accepted, {declinedN} declined, {nrN} not required.
                </p>
                <p className="mt-2 text-sm text-muted">Next: preview and send outcome emails, then create the Operations project.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={() => setWinStep(1)}>
                    Back
                  </button>
                  <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" onClick={buildEmailPreviewsAndGoStep3}>
                    Continue to emails
                  </button>
                </div>
              </>
            ) : null}
            {winStep === 3 ? (
              <>
                <h2 className="text-lg font-bold text-primary">Step 3 — Email previews</h2>
                <p className="mt-1 text-sm text-muted">Edit any message, then send all and create the project.</p>
                {emailPreviews.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">No outcome emails (no accepted/declined trades with addresses).</p>
                ) : (
                  emailPreviews.map((m, i) => (
                    <label key={i} className="mt-4 block text-xs font-semibold text-muted">
                      {m.kind} → {m.to}
                      <textarea
                        rows={10}
                        className="mt-1 w-full rounded-lg border border-hairline p-2 text-sm"
                        value={m.body}
                        onChange={(e) => {
                          const next = [...emailPreviews];
                          next[i] = { ...next[i], body: e.target.value };
                          setEmailPreviews(next);
                        }}
                      />
                    </label>
                  ))
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={() => setWinStep(2)}>
                    Back
                  </button>
                  <button type="button" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={executeWin}>
                    Send all &amp; create project
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {loseOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setLoseOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-primary">Mark as lost</h2>
            <p className="mt-2 text-sm text-muted">Emails go to subcontractors who provided a quote.</p>
            {losePreviews.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No received quotes — no emails.</p>
            ) : (
              losePreviews.map((p, i) => (
                <label key={i} className="mt-4 block text-xs font-semibold text-muted">
                  To {p.to}
                  <textarea
                    value={p.body}
                    rows={8}
                    className="mt-1 w-full rounded-lg border border-hairline p-2 text-sm text-ink"
                    onChange={(e) => {
                      const next = [...losePreviews];
                      next[i] = { ...next[i], body: e.target.value };
                      setLosePreviews(next);
                    }}
                  />
                </label>
              ))
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-4 py-2 text-sm text-muted" onClick={() => setLoseOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white" onClick={executeLose}>
                Confirm lost
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Full scope slide-over */}
      {scopePanelOpen ? (
        <div
          className="fixed inset-0 z-[90] flex justify-end bg-black/40"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setScopePanelOpen(false)}
        >
          <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-primary">Project scope</h2>
                <p className="text-xs text-muted">{job.address}</p>
              </div>
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setScopePanelOpen(false)}>
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Project description + key details */}
              {(() => {
                const ex = job.extracted_data || {};
                const specs = ex.building_specs || {};
                const details = [
                  ["Type", ex.project_type],
                  ["Storeys", ex.storeys],
                  ["Floor area", ex.floor_area_m2 ? `${ex.floor_area_m2} m²` : null],
                  ["Arch ref", ex.arch_ref],
                  ["Eng ref", ex.eng_ref],
                  ["External walls", specs.external_walls],
                  ["Roof", specs.roof_type],
                ].filter(([, v]) => v != null && v !== "");
                if (!ex.key_project_notes?.trim() && !details.length) return null;
                return (
                  <section>
                    {ex.key_project_notes?.trim() ? (
                      <p className="mb-3 text-sm leading-relaxed text-ink">{ex.key_project_notes.trim()}</p>
                    ) : null}
                    {details.length > 0 && (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {details.map(([label, val]) => (
                          <div key={label}>
                            <dt className="font-semibold text-muted">{label}</dt>
                            <dd className="text-ink">{val}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                );
              })()}

              {/* Per-trade scopes — scope_summary only */}
              <section>
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">Trade scopes</h3>
                <div className="space-y-2">
                  {RFQ_TRADE_ORDER.map((tradeKey) => {
                    const note = coerceExtraction(job.extracted_data).trade_notes?.[tradeKey];
                    const summary = note?.scope_summary?.trim();
                    if (!summary) return null;
                    const lines = summary.split(/\n|•/).map((l) => l.trim()).filter(Boolean);
                    return (
                      <div key={tradeKey} className="rounded-lg border border-hairline bg-page px-3 py-2.5">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                          {TRADE_LABEL[tradeKey] || tradeKey}
                        </div>
                        <ul className="space-y-0.5">
                          {lines.map((l, i) => (
                            <li key={i} className="flex gap-2 text-xs text-ink">
                              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                              {l}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
