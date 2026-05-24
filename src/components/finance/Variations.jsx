import { authFetch } from "../../lib/authFetch.js";
import { useCallback, useEffect, useState } from "react";

const fmt = n =>
  n == null ? "—"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

const fmtDate = iso =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_STYLES = {
  draft:           "text-muted bg-page border-hairline",
  sent_to_client:  "text-blue-700 bg-blue-50 border-blue-200",
  signed:          "text-green-700 bg-green-50 border-green-200",
  rejected:        "text-red-700 bg-red-50 border-red-200",
  void:            "text-muted bg-page border-hairline opacity-50",
  invoiced:        "text-purple-700 bg-purple-50 border-purple-200",
};
const STATUS_LABELS = {
  draft: "Draft", sent_to_client: "Sent to client", signed: "Signed ✓",
  rejected: "Rejected", void: "Void", invoiced: "Invoiced",
};

// ── Recipe picker (Buildxact line items) ──────────────────────────────────────

function RecipePicker({ recipes, onAdd }) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? recipes.filter(r =>
        r.description.toLowerCase().includes(search.toLowerCase()) ||
        r.category.toLowerCase().includes(search.toLowerCase())
      )
    : recipes.slice(0, 30);

  return (
    <div className="border border-hairline rounded-lg overflow-hidden">
      <div className="p-2 border-b border-hairline bg-page">
        <input
          type="text"
          placeholder="Search Buildxact items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded border border-hairline focus:outline-none focus:border-primary"
        />
      </div>
      <ul className="max-h-48 overflow-y-auto divide-y divide-hairline">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted">No items found</li>
        )}
        {filtered.map(r => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onAdd(r)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary/5 transition"
            >
              <div>
                <p className="text-xs font-semibold text-ink">{r.description}</p>
                <p className="text-[10px] text-muted">{r.category}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">
                {fmt(r.unit_cost)}/{r.uom}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Line items editor ─────────────────────────────────────────────────────────

function LineItemsEditor({ items, onChange, recipes, recipesLoading }) {
  const [showPicker, setShowPicker] = useState(false);

  function addFromRecipe(recipe) {
    onChange([...items, {
      description: recipe.description,
      qty: recipe.suggested_qty || 1,
      uom: recipe.uom,
      unit_cost: recipe.unit_cost,
    }]);
    setShowPicker(false);
  }

  function addBlank() {
    onChange([...items, { description: "", qty: 1, uom: "item", unit_cost: 0 }]);
  }

  function remove(i) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  function update(i, field, val) {
    onChange(items.map((item, idx) =>
      idx === i ? { ...item, [field]: ["qty", "unit_cost"].includes(field) ? Number(val) || 0 : val } : item
    ));
  }

  const lineTotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_cost || 0), 0);

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="rounded-lg border border-hairline overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-page border-b border-hairline">
                {["Description", "Qty", "UOM", "Unit rate", "Total", ""].map(h => (
                  <th key={h} className="px-2 py-1.5 text-left font-bold text-muted uppercase tracking-wide text-[9px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-hairline last:border-0">
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => update(i, "description", e.target.value)}
                      placeholder="Description"
                      className="w-full px-1 py-0.5 rounded border border-hairline text-xs focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="px-2 py-1 w-16">
                    <input
                      type="number"
                      value={item.qty}
                      onChange={e => update(i, "qty", e.target.value)}
                      className="w-full px-1 py-0.5 rounded border border-hairline text-xs focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="px-2 py-1 w-16">
                    <input
                      type="text"
                      value={item.uom}
                      onChange={e => update(i, "uom", e.target.value)}
                      className="w-full px-1 py-0.5 rounded border border-hairline text-xs focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="px-2 py-1 w-24">
                    <input
                      type="number"
                      value={item.unit_cost}
                      onChange={e => update(i, "unit_cost", e.target.value)}
                      className="w-full px-1 py-0.5 rounded border border-hairline text-xs focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="px-2 py-1 w-20 text-right font-semibold text-ink">
                    {fmt(item.qty * item.unit_cost)}
                  </td>
                  <td className="px-2 py-1 w-8">
                    <button type="button" onClick={() => remove(i)} className="text-muted hover:text-danger transition">
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end px-3 py-1.5 bg-page border-t border-hairline">
            <span className="text-xs font-bold text-ink">Line total: {fmt(lineTotal)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={addBlank}
          className="text-xs text-primary font-semibold hover:underline">
          + Add line
        </button>
        {recipes.length > 0 && (
          <button type="button" onClick={() => setShowPicker(v => !v)}
            className="text-xs text-muted hover:text-ink transition">
            {showPicker ? "Hide Buildxact items" : "Pick from Buildxact estimate ↓"}
          </button>
        )}
        {recipesLoading && <span className="text-xs text-muted">Loading Buildxact…</span>}
      </div>

      {showPicker && recipes.length > 0 && (
        <RecipePicker recipes={recipes} onAdd={addFromRecipe} />
      )}
    </div>
  );
}

// ── New / Edit variation modal ────────────────────────────────────────────────

function VariationModal({ jobId, variation, tradeCategories, onSaved, onClose }) {
  const isEdit = Boolean(variation);
  const [title, setTitle] = useState(variation?.title || "");
  const [description, setDescription] = useState(variation?.description || "");
  const [tradeId, setTradeId] = useState(variation?.trade_category_id || "");
  const [lineItems, setLineItems] = useState(variation?.line_items || []);
  const [costToBuilder, setCostToBuilder] = useState(variation?.cost_to_builder ?? "");
  const [manualAmount, setManualAmount] = useState(
    (!variation?.line_items?.length && variation?.amount_ex_gst) ? String(variation.amount_ex_gst) : ""
  );
  const [eotDays, setEotDays] = useState(variation?.eot_days || 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [marginPct, setMarginPct] = useState("20");

  // Load Buildxact recipes on mount
  useEffect(() => {
    setRecipesLoading(true);
    fetch(`/api/finance/jobs/${jobId}/variations/recipes`)
      .then(r => r.json())
      .then(j => { if (j.ok) setRecipes(j.recipes); })
      .catch(() => {})
      .finally(() => setRecipesLoading(false));
  }, [jobId]);

  // Derived amounts
  const lineTotal = lineItems.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_cost || 0), 0);
  const costBase = lineItems.length > 0 ? lineTotal : Number(costToBuilder) || 0;
  // If line items drive cost, apply margin to get client price
  const derivedAmountEx = lineItems.length > 0
    ? Math.round(costBase / (1 - Number(marginPct) / 100) * 100) / 100
    : Number(manualAmount) || 0;
  const amountEx = derivedAmountEx;
  const amountInc = Math.round(amountEx * 1.1 * 100) / 100;
  const margin = amountEx > 0 && costBase > 0 ? ((amountEx - costBase) / amountEx) * 100 : null;

  async function save() {
    if (!title.trim()) { setError("Title required"); return; }
    if (!amountEx) { setError("Amount required"); return; }
    setSaving(true); setError(null);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      trade_category_id: tradeId || null,
      cost_to_builder: costBase || null,
      amount_ex_gst: amountEx,
      line_items: lineItems.length > 0 ? lineItems : [],
      eot_days: Number(eotDays) || 0,
    };
    const url = isEdit
      ? `/api/finance/jobs/${jobId}/variations/${variation.id}`
      : `/api/finance/jobs/${jobId}/variations`;
    const method = isEdit ? "PUT" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setSaving(false);
    if (j.ok) { onSaved(j.variation); onClose(); }
    else setError(j.error || "Failed to save");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/40 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-bold text-ink">{isEdit ? "Edit Variation" : "New Variation"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title + Trade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink mb-1 block">Title <span className="text-danger">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Additional retaining wall"
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-bold text-ink mb-1 block">Trade Category</label>
              <select value={tradeId} onChange={e => setTradeId(e.target.value)}
                className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— Select trade —</option>
                {tradeCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Scope of works, reason for variation…"
              rows={3}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Line items */}
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Line Items</label>
            <LineItemsEditor
              items={lineItems}
              onChange={setLineItems}
              recipes={recipes}
              recipesLoading={recipesLoading}
            />
          </div>

          {/* Pricing */}
          <div className="rounded-lg border border-hairline bg-page p-3 space-y-3">
            <p className="text-xs font-bold text-ink">Pricing</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {lineItems.length > 0 ? (
                <>
                  <div>
                    <label className="text-[10px] font-semibold text-muted block mb-1">Cost to builder</label>
                    <p className="text-sm font-bold text-ink">{fmt(lineTotal)}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted block mb-1">Margin %</label>
                    <input type="number" min={0} max={90} value={marginPct} onChange={e => setMarginPct(e.target.value)}
                      className="w-full rounded border border-hairline px-2 py-1 text-sm focus:outline-none focus:border-primary" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] font-semibold text-muted block mb-1">Cost to builder (ex GST)</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-xs text-muted">$</span>
                      <input type="number" value={costToBuilder} onChange={e => setCostToBuilder(e.target.value)}
                        placeholder="0"
                        className="w-full rounded border border-hairline pl-5 py-1 text-sm focus:outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted block mb-1">Charge to client (ex GST) <span className="text-danger">*</span></label>
                    <div className="relative">
                      <span className="absolute left-2 top-1.5 text-xs text-muted">$</span>
                      <input type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)}
                        placeholder="0"
                        className="w-full rounded border border-hairline pl-5 py-1 text-sm focus:outline-none focus:border-primary" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="text-[10px] font-semibold text-muted block mb-1">Client charge (ex GST)</label>
                <p className="text-sm font-bold text-ink">{fmt(amountEx)}</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-muted block mb-1">Total (inc GST)</label>
                <p className="text-sm font-bold text-primary">{fmt(amountInc)}</p>
              </div>
            </div>
            {margin != null && (
              <p className="text-xs text-muted">
                Margin: <span className={`font-bold ${margin >= 15 ? "text-green-700" : "text-amber-700"}`}>{margin.toFixed(1)}%</span>
              </p>
            )}
          </div>

          {/* EOT */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-ink whitespace-nowrap">Extension of Time (days)</label>
            <input type="number" min={0} value={eotDays} onChange={e => setEotDays(e.target.value)}
              className="w-24 rounded-lg border border-hairline px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <p className="text-xs text-muted">{eotDays > 0 ? `+${eotDays} days to programme` : "No EOT"}</p>
          </div>

          {error && <p className="text-xs text-danger font-medium">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-semibold text-muted hover:text-ink transition">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-40 transition">
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create variation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Send variation modal ──────────────────────────────────────────────────────

function SendVariationModal({ jobId, variation, onSent, onClose }) {
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function send() {
    setSending(true); setError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/variations/${variation.id}/send`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email_to: emailTo || undefined, email_cc: emailCc || undefined })
    });
    const j = await r.json();
    setSending(false);
    if (j.ok) { setDone(j); onSent(j.variation); }
    else setError(j.error || "Failed to send");
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-xl p-6 text-center space-y-3">
          <div className="text-3xl">✅</div>
          <p className="font-bold text-ink">Variation sent</p>
          {done.emailSent && <p className="text-sm text-muted">Email sent to {emailTo}</p>}
          {done.pdf_b64 && (
            <a href={`data:application/pdf;base64,${done.pdf_b64}`}
              download={`Variation-${variation.variation_number}.pdf`}
              className="inline-block rounded-lg border border-hairline bg-page px-4 py-2 text-sm font-semibold text-ink hover:bg-surface transition">
              ↓ Download PDF
            </a>
          )}
          <button type="button" onClick={onClose}
            className="block w-full rounded-lg bg-primary py-2 text-sm font-bold text-white">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-bold text-ink">Send Variation {variation.variation_number}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="rounded-lg bg-page border border-hairline px-3 py-2 text-sm">
            <p className="font-semibold text-ink">{variation.title}</p>
            <p className="text-muted text-xs mt-0.5">{fmt(variation.amount_ex_gst)} ex GST · {fmt(Number(variation.amount_ex_gst || 0) * 1.1)} inc GST</p>
          </div>
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">Send to (optional)</label>
            <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)}
              placeholder="client@email.com"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-bold text-ink mb-1 block">CC (optional)</label>
            <input type="email" value={emailCc} onChange={e => setEmailCc(e.target.value)}
              placeholder="accounts@blueleafbuilding.com.au"
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          {error && <p className="text-xs text-danger font-medium">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-lg border border-hairline py-2.5 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" onClick={send} disabled={sending}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-40">
            {sending ? "Sending…" : emailTo ? "Send + email" : "Mark as sent"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject / sign confirmation modal ─────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, confirmClass, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const needsReason = title.toLowerCase().includes("reject");

  async function go() {
    setLoading(true);
    await onConfirm(reason);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-xl p-5 space-y-4">
        <p className="font-bold text-ink">{title}</p>
        <p className="text-sm text-muted">{message}</p>
        {needsReason && (
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)…" rows={2}
            className="w-full rounded-lg border border-hairline px-3 py-2 text-sm focus:outline-none resize-none" />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-lg border border-hairline py-2 text-sm font-semibold text-muted">Cancel</button>
          <button type="button" onClick={go} disabled={loading}
            className={`flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-40 ${confirmClass}`}>
            {loading ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Variations({ jobId, onUpdate }) {
  const [variations, setVariations] = useState([]);
  const [tradeCategories, setTradeCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sending, setSending] = useState(null);
  const [confirming, setConfirming] = useState(null); // { type: 'sign'|'reject'|'void', variation }
  const [actionError, setActionError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [vr, tr] = await Promise.all([
      fetch(`/api/finance/jobs/${jobId}/variations`).then(r => r.json()),
      fetch("/api/finance/trade-categories").then(r => r.json())
    ]);
    if (vr.ok) setVariations(vr.variations);
    if (tr.ok) setTradeCategories(tr.categories);
    setLoading(false);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  function applyVariation(updated) {
    setVariations(prev => {
      const exists = prev.find(v => v.id === updated.id);
      return exists
        ? prev.map(v => v.id === updated.id ? updated : v)
        : [...prev, updated];
    });
    onUpdate?.();
  }

  async function handleSign(variation) {
    setActionError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/variations/${variation.id}/sign`, { method: "POST" });
    const j = await r.json();
    if (j.ok) { applyVariation(j.variation); setConfirming(null); }
    else setActionError(j.error || "Failed to mark as signed");
  }

  async function handleReject(variation, reason) {
    setActionError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/variations/${variation.id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const j = await r.json();
    if (j.ok) { applyVariation(j.variation); setConfirming(null); }
    else setActionError(j.error || "Failed to mark as rejected");
  }

  async function handleVoid(variation) {
    setActionError(null);
    const r = await authFetch(`/api/finance/jobs/${jobId}/variations/${variation.id}/void`, { method: "POST" });
    const j = await r.json();
    if (j.ok) { applyVariation(j.variation); setConfirming(null); }
    else setActionError(j.error || "Failed to void variation");
  }

  const active = variations.filter(v => v.status !== "void");
  const signedTotal = active.filter(v => v.status === "signed").reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);
  const pendingTotal = active.filter(v => v.status === "sent_to_client").reduce((s, v) => s + Number(v.amount_ex_gst || 0), 0);

  if (loading) return <div className="py-6 text-center text-sm text-muted">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>Signed: <span className="font-bold text-green-700">{fmt(signedTotal)}</span></span>
          <span>Pending: <span className="font-bold text-blue-700">{fmt(pendingTotal)}</span></span>
          {pendingTotal > 0 && (
            <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-semibold text-[10px] uppercase tracking-wide">
              unsigned — no P&amp;L impact
            </span>
          )}
        </div>
        <button type="button" onClick={() => setShowNew(true)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary/90 transition">
          + New variation
        </button>
      </div>

      {/* List */}
      {active.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline bg-page py-8 text-center">
          <p className="text-sm text-muted">No variations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map(v => {
            const amountEx = Number(v.amount_ex_gst || 0);
            const isSigned   = v.status === "signed";
            const isSent     = v.status === "sent_to_client";
            const isDraft    = v.status === "draft";
            const isRejected = v.status === "rejected";
            return (
              <div key={v.id}
                className={`rounded-lg border bg-surface p-3 ${isSigned ? "border-green-200" : isSent ? "border-blue-200" : isRejected ? "border-red-200" : "border-hairline"}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-muted">#{v.variation_number}</span>
                      <span className="text-sm font-semibold text-ink truncate">{v.title}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[v.status] || ""}`}>
                        {STATUS_LABELS[v.status] || v.status}
                      </span>
                      {isSent && (
                        <span className="text-[10px] text-amber-700 font-semibold">
                          unsigned — not in P&L
                        </span>
                      )}
                    </div>
                    {v.description && (
                      <p className="text-xs text-muted mt-1 line-clamp-2">{v.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
                      <span className="font-semibold text-ink">{fmt(amountEx)} <span className="font-normal text-muted">ex GST</span></span>
                      <span>·</span>
                      <span className="font-semibold text-ink">{fmt(amountEx * 1.1)} <span className="font-normal text-muted">inc GST</span></span>
                      {v.trade_category_name && <><span>·</span><span>{v.trade_category_name}</span></>}
                      {v.eot_days > 0 && <><span>·</span><span className="text-amber-600 font-semibold">+{v.eot_days}d EOT</span></>}
                    </div>
                    {v.sent_date && (
                      <p className="text-[10px] text-muted mt-0.5">Sent: {fmtDate(v.sent_date)}</p>
                    )}
                    {v.signed_date && (
                      <p className="text-[10px] text-green-700 mt-0.5 font-semibold">Signed: {fmtDate(v.signed_date)}</p>
                    )}
                    {v.rejection_reason && (
                      <p className="text-[10px] text-red-700 mt-0.5">Rejected: {v.rejection_reason}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    {isDraft && (
                      <>
                        <button type="button" onClick={() => setEditing(v)}
                          className="text-xs text-muted hover:text-ink font-semibold transition px-2 py-1 rounded hover:bg-page">
                          Edit
                        </button>
                        <button type="button" onClick={() => setSending(v)}
                          className="text-xs text-primary font-semibold hover:underline px-2 py-1">
                          Send →
                        </button>
                      </>
                    )}
                    {isSent && (
                      <>
                        <button type="button" onClick={() => setConfirming({ type: "sign", variation: v })}
                          className="text-xs text-green-700 font-bold hover:underline px-2 py-1">
                          Mark signed
                        </button>
                        <button type="button" onClick={() => setConfirming({ type: "reject", variation: v })}
                          className="text-xs text-red-700 font-semibold hover:underline px-2 py-1">
                          Reject
                        </button>
                        <button type="button" onClick={() => setSending(v)}
                          className="text-xs text-muted hover:text-ink font-semibold px-2 py-1">
                          Resend
                        </button>
                      </>
                    )}
                    {isRejected && (
                      <button type="button" onClick={() => setEditing(v)}
                        className="text-xs text-primary font-semibold hover:underline px-2 py-1">
                        Revise
                      </button>
                    )}
                    {(isDraft || isSent || isRejected) && (
                      <button type="button" onClick={() => setConfirming({ type: "void", variation: v })}
                        className="text-xs text-muted hover:text-danger transition px-1">
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {(showNew || editing) && (
        <VariationModal
          jobId={jobId}
          variation={editing}
          tradeCategories={tradeCategories}
          onSaved={v => {
            applyVariation(v);
            setShowNew(false);
            setEditing(null);
          }}
          onClose={() => { setShowNew(false); setEditing(null); }}
        />
      )}

      {sending && (
        <SendVariationModal
          jobId={jobId}
          variation={sending}
          onSent={v => { applyVariation(v); setSending(null); }}
          onClose={() => setSending(null)}
        />
      )}

      {actionError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-danger text-white text-sm font-semibold px-4 py-2 shadow-lg">
          {actionError}
          <button type="button" onClick={() => setActionError(null)} className="ml-3 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {confirming?.type === "sign" && (
        <ConfirmModal
          title="Mark variation as signed?"
          message={`${confirming.variation.title} — ${fmt(confirming.variation.amount_ex_gst)} ex GST. This will update the contract value immediately.`}
          confirmLabel="Mark signed"
          confirmClass="bg-green-700"
          onConfirm={() => handleSign(confirming.variation)}
          onClose={() => setConfirming(null)}
        />
      )}

      {confirming?.type === "reject" && (
        <ConfirmModal
          title="Reject this variation?"
          message={`${confirming.variation.title} — ${fmt(confirming.variation.amount_ex_gst)} ex GST.`}
          confirmLabel="Reject"
          confirmClass="bg-red-700"
          onConfirm={reason => handleReject(confirming.variation, reason)}
          onClose={() => setConfirming(null)}
        />
      )}

      {confirming?.type === "void" && (
        <ConfirmModal
          title="Void this variation?"
          message="This cannot be undone. The variation will be removed from all calculations."
          confirmLabel="Void"
          confirmClass="bg-danger"
          onConfirm={() => handleVoid(confirming.variation)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
