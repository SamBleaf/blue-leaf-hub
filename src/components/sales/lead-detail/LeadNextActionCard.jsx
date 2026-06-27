/**
 * LeadNextActionCard — Pass 3A "Do this now" focus wrapper. Presentational shell;
 * the stage-specific work (children) is the existing per-stage block, unchanged.
 */
export default function LeadNextActionCard({ stageLabel, children, className = "" }) {
  return (
    <div className={`space-y-4 rounded-card border border-primary/30 bg-primary/[0.03] p-4 sm:p-5 ${className}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-primary">
        Do this now{stageLabel ? ` · ${stageLabel}` : ""}
      </p>
      {children}
    </div>
  );
}
