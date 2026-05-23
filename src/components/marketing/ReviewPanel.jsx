// ReviewPanel — shows AI review scores for a generated draft

const SCORE_LABELS = {
  lead_quality:       "Lead quality",
  specificity:        "Specificity",
  local_relevance:    "Local relevance",
  educational_value:  "Educational value",
};

const FLAG_LABELS = {
  brand_voice:   "Brand voice",
  overpromise:   "Overpromise check",
};

function ScoreBar({ score, pass }) {
  const pct = ((score || 0) / 10) * 100;
  const colour = pass === false ? "bg-red-400" : score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${colour}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ReviewPanel({ scores, blocked, blockReason }) {
  if (!scores) return null;

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${blocked ? "border-red-300 bg-red-50" : "border-hairline bg-surface"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">Content Review</span>
        {blocked ? (
          <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Blocked</span>
        ) : scores.overall_pass ? (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Passed</span>
        ) : (
          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Review needed</span>
        )}
      </div>

      {/* Hard block */}
      {blocked && blockReason && (
        <div className="bg-red-100 border border-red-300 rounded-lg px-3 py-2">
          <p className="text-xs font-semibold text-red-700 mb-0.5">Content blocked</p>
          <p className="text-xs text-red-600">{blockReason}</p>
        </div>
      )}

      {/* Numeric scores */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
        {Object.entries(SCORE_LABELS).map(([key, label]) => {
          const check = scores[key];
          if (!check) return null;
          const score = check.score ?? 0;
          const pass = check.pass;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">{label}</span>
                <span className={`text-xs font-semibold ${pass === false ? "text-red-500" : score >= 8 ? "text-emerald-600" : score >= 6 ? "text-amber-600" : "text-red-500"}`}>
                  {score}/10
                </span>
              </div>
              <ScoreBar score={score} pass={pass} />
              {check.notes && <p className="text-xs text-muted mt-0.5 leading-tight">{check.notes}</p>}
            </div>
          );
        })}
      </div>

      {/* Flag checks */}
      {Object.entries(FLAG_LABELS).map(([key, label]) => {
        const check = scores[key];
        if (!check) return null;
        const pass = check.pass !== false;
        const items = check.flags || check.matches || [];
        if (pass && items.length === 0) {
          return (
            <div key={key} className="flex items-center gap-2 text-xs text-muted">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="text-emerald-500 shrink-0">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {label} passed
            </div>
          );
        }
        return (
          <div key={key}>
            <div className="flex items-center gap-2 text-xs">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={pass ? "text-emerald-500" : "text-red-500"} style={{ flexShrink: 0 }}>
                {pass
                  ? <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  : <path d="M12 9v4m0 4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" strokeLinecap="round" strokeLinejoin="round" />
                }
              </svg>
              <span className={pass ? "text-muted" : "text-red-600 font-medium"}>{label} {pass ? "passed" : "flagged"}</span>
            </div>
            {items.length > 0 && (
              <ul className="mt-1 ml-5 space-y-0.5">
                {items.map((f, i) => (
                  <li key={i} className="text-xs text-red-600">• {f}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
