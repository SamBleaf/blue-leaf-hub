// Trade-conflict banner (presentational). Consumes the real /api/operations/trade-conflicts
// shape: conflicts[].trade + conflicts[].projects[].{ id, address, startDate, endDate }.
function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export default function OpsConflictBanner({ conflicts = [] }) {
  if (!conflicts.length) return null;
  return (
    <div className="space-y-2 rounded-card border border-warning/40 bg-warning/10 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-warning">
        {conflicts.length} trade scheduling conflict{conflicts.length !== 1 ? "s" : ""}
      </p>
      {conflicts.map((c) => (
        <div key={c.trade} className="text-xs text-ink">
          <span className="font-semibold">{c.trade}</span>
          {" is booked across "}
          {(c.projects || []).map((p, i) => (
            <span key={p.id}>
              {i > 0 && " and "}
              <span className="font-semibold">{p.address}</span>
              {p.startDate && p.endDate && <>{" ("}{shortDate(p.startDate)}{"–"}{shortDate(p.endDate)}{")"}</>}
            </span>
          ))}
          {" on overlapping dates"}
        </div>
      ))}
    </div>
  );
}
