/**
 * StageDrawings — the drawings on file, inside the stage that uses them (Sales blueprint PTS-03). Reads the same lead documents as
 * the Documents tab, so there's no second list. The newest of each type is the current one.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/apiFetch.js";

const LABELS = { working_drawings: "Working drawings", concept_drawings: "Concept drawings", blueprint: "Plans" };
const fmt = (d) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export default function StageDrawings({ leadId, title, types }) {
  const [docs, setDocs] = useState(null);
  const key = types.join();
  useEffect(() => {
    let live = true;
    apiFetch(`/api/sales/leads/${leadId}/documents`).then(({ ok, data }) => { if (live && ok) setDocs((data?.documents || []).filter((d) => key.split(",").includes(d.document_type))); });
    return () => { live = false; };
  }, [leadId, key]);
  const seen = new Set();
  return (
    <div className="rounded-card border border-hairline bg-surface p-4" data-testid="stage-drawings">
      <h3 className="section-label mb-1">{title}</h3>
      {docs && docs.length > 0 ? (
        <ul className="divide-y divide-hairline/60 text-xs">
          {docs.map((d) => {
            const current = !seen.has(d.document_type);
            seen.add(d.document_type);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1">
                {d.download_url ? <a href={d.download_url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{d.filename}</a> : <span className="text-ink">{d.filename}</span>}
                <span className="text-muted">{LABELS[d.document_type] || d.document_type} · {fmt(d.created_at)}</span>
                {current && <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Latest</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">{docs ? "Nothing on file yet." : "Loading…"} Add drawings in the <span className="font-medium text-ink">Documents</span> tab with the type set to Working drawings. They carry to the job.</p>
      )}
    </div>
  );
}
