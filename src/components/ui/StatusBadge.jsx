/**
 * StatusBadge — one semantic badge system for the whole Hub.
 *
 * Presentational only. Pass a `variant` (preferred) or a raw `status` string and
 * let `statusToVariant` (from ../../lib/statusBadge.js) map it. Variants use the
 * Blue Leaf tokens + light tints (never heavy/black fills).
 *
 * <StatusBadge variant="success">Won</StatusBadge>
 * <StatusBadge status={lead.stage}>{label}</StatusBadge>
 */
import { statusToVariant } from "../../lib/statusBadge.js";

const VARIANTS = {
  success: "bg-accent/10 text-accent",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-sky-50 text-sky-700",
  stage: "bg-primary/10 text-primary",
  money: "bg-emerald-50 text-emerald-700",
  blocked: "bg-red-100 text-red-700",
};

export default function StatusBadge({ variant, status, children, dot = false, className = "" }) {
  const v = variant || (status != null ? statusToVariant(status) : "neutral");
  const tone = VARIANTS[v] || VARIANTS.neutral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone} ${className}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}
