export default function ProgressBar({ percent, color, label }) {
  const pct = Math.min(100, Math.max(0, percent || 0));
  return (
    <div>
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color || "#16A34A" }}
        />
      </div>
      {label && <p className="text-sm text-muted mt-1.5">{label}</p>}
    </div>
  );
}
