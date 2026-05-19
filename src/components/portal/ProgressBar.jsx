export default function ProgressBar({ percent, color, label, tone = "light" }) {
  const pct = Math.min(100, Math.max(0, percent || 0));
  const onDark = tone === "onDark";
  const track = onDark ? "bg-white/20" : "bg-gray-100";
  const fill = color || (onDark ? "#86efac" : "#16A34A");

  return (
    <div>
      <div className={`w-full rounded-full h-2.5 overflow-hidden ${track}`}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: fill }}
        />
      </div>
      {label ? (
        <p className={`text-sm mt-1.5 ${onDark ? "text-white/70" : "text-muted"}`}>{label}</p>
      ) : null}
    </div>
  );
}
