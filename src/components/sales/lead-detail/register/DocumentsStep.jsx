/**
 * DocumentsStep — stage-appropriate document drafts built live from the register (interim view; the
 * controlled render + immutable issue flow replaces this in the documents checkpoint).
 */
import { useState } from "react";
import { buildDocViews, isClientSelection, outstandingItems } from "../../../../lib/register.js";

export default function DocumentsStep({ lead, reg }) {
  const [which, setWhich] = useState(null);
  const data = which ? buildDocViews(lead, reg) : null;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">Drafts are built live from this register — not issued. Unknowns show as <b>TBC</b>.</div>
      <div className="flex flex-wrap gap-2">
        {[["clientBrief", "Client Project Brief"], ["architectBrief", "Architect Design Brief"], ["selections", "Selections & Finishes"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setWhich(k)} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-ink hover:bg-page">Preview {l} (draft)</button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{reg.items.filter(isClientSelection).length} selection item(s) · {outstandingItems(reg).length} outstanding.</p>
      {data && <pre className="max-h-80 overflow-auto rounded border border-hairline bg-page p-2 text-[10px]">{JSON.stringify(data[which], null, 1)}</pre>}
    </div>
  );
}
