// =============================================================================
// AssigneeStack — an initials/avatar stack with +N overflow for a task's assignees.
// Shared by every task surface (worker PWA, carpentry, charge-up, ops, workforce team) so
// multi-assign renders consistently. `assignees` = [{ id, name }]; empty → "Unassigned".
// =============================================================================
const initials = (n) => String(n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export default function AssigneeStack({ assignees = [], max = 3, size = "sm", onClick, meId }) {
  const dim = size === "xs" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  const list = assignees || [];
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  const Wrap = onClick ? "button" : "span";
  return (
    <Wrap type={onClick ? "button" : undefined} onClick={onClick} className={`inline-flex items-center gap-1 ${onClick ? "focus-ring rounded" : ""}`}>
      {list.length === 0 ? (
        <span className="text-xs text-muted">Unassigned</span>
      ) : (
        <span className="flex -space-x-1.5">
          {shown.map((a) => (
            <span key={a.id} title={a.name || ""} className={`${dim} rounded-full ${a.id === meId ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary"} font-semibold flex items-center justify-center border border-surface`}>{initials(a.name)}</span>
          ))}
          {extra > 0 && <span className={`${dim} rounded-full bg-slate-200 text-slate-600 font-semibold flex items-center justify-center border border-surface`}>+{extra}</span>}
        </span>
      )}
    </Wrap>
  );
}
