/**
 * BaselineGuide — the Blue Leaf pricing guide at the end of Whole House (Tab 27 B05, Gate 3.2), and the staff-only
 * review list under the envelope goals (B04, DEC-MRUX-03).
 *
 * Both are for staff in the office and across the table. A tier only writes to register meta. Nothing here can touch an
 * item, so a tier can't change a choice, set a preference or an approval, or say what something costs. The review list
 * is derived from the goals on the card and is not stored at all.
 */
import {
  baselineView, setProjectTier, setCategoryTier, applyProjectGuide, normaliseBaseline, performanceSuggestions, assumptionIsDraft,
  BASELINE_TIERS, BASELINE_WORDING_STATUS, REVIEW_DISCLAIMER, PASSIVE_HOUSE_NOTE, PERFORMANCE_REVIEW_CHECKS,
} from "../../../../lib/register.js";
import { Chip, Section } from "./ui.jsx";

const TIERS = Object.entries(BASELINE_TIERS);
const pill = (on) => `focus-ring inline-flex min-h-[40px] items-center rounded-full border px-3 py-1 text-xs sm:min-h-[30px] sm:py-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-primary bg-primary font-semibold text-white" : "border-hairline bg-surface text-ink hover:bg-page"}`;

function statusLine(c) {
  const chosen = c.chosen.map((x) => x.title).join("; ");
  if (c.status === "settled") return "Settled as by others, excluded or N/A. No assumption needed.";
  if (c.status === "chosen") return `Chosen: ${chosen}. The client's choice is what counts, so no assumption is used.`;
  const gaps = [...c.zoneGaps, ...c.partGaps];
  if (c.status === "part") return `Chosen: ${chosen || "part of this"}. An assumption only covers what isn't chosen${gaps.length ? ` (${gaps.join(", ")})` : ""}.`;
  return "Nothing chosen yet.";
}

export default function BaselineGuide({ reg, actor, mutateMeta, readOnly }) {
  const baseline = normaliseBaseline(reg.meta.baseline);
  const view = baselineView(reg);
  const stamp = { at: new Date().toISOString(), by: actor?.full_name || actor?.email || "Blue Leaf" };
  const save = (next) => mutateMeta?.({ baseline: next });
  const unset = view.filter((c) => !c.held && (c.status === "open" || c.status === "part"));
  const set = view.filter((c) => c.held).length;
  return (
    <div className="rounded-lg border border-hairline bg-page p-3" data-testid="baseline-guide">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="text-xs font-semibold text-ink">Blue Leaf pricing guide</p>
        <Chip tone="amber">Staff only</Chip>
        {BASELINE_WORDING_STATUS !== "confirmed" && <Chip>Draft wording</Chip>}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        Choose this after the client&apos;s direction above. It gives the estimator a labelled assumption where nothing has been chosen. It isn&apos;t a client choice, an approval or a price, and it never changes what the client has chosen.
      </p>

      <div className="mt-2" role="group" aria-label="Project guide">
        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">Project guide</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {TIERS.map(([tier, label]) => (
            <button key={tier} type="button" aria-pressed={baseline.projectTier === tier} disabled={readOnly} className={pill(baseline.projectTier === tier)} data-testid={`baseline-project-${tier}`}
              onClick={() => save(setProjectTier(baseline, tier))}>
              {baseline.projectTier === tier && <span aria-hidden="true" className="mr-1">✓</span>}{label}
            </button>
          ))}
          {baseline.projectTier && unset.length > 0 && !readOnly && (
            <button type="button" className="focus-ring inline-flex min-h-[40px] items-center rounded px-1 text-[11px] font-medium text-primary hover:underline sm:min-h-[30px]" data-testid="baseline-use-project"
              onClick={() => save(applyProjectGuide(reg, stamp))}>
              Use {BASELINE_TIERS[baseline.projectTier]} for the {unset.length} {unset.length === 1 ? "category" : "categories"} with nothing set
            </button>
          )}
        </div>
      </div>

      <div className="mt-2">
        <Section title="By category" count={`${set} of ${view.length} set`} defaultOpen={false}>
          {view.map((c) => (
            <div key={c.key} className="rounded border border-hairline bg-surface p-2" data-testid={`baseline-cat-${c.key}`}>
              <p className="text-xs font-semibold text-ink">{c.label}</p>
              <p className="text-[11px] text-muted">{statusLine(c)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label={`${c.label} pricing assumption`}>
                {TIERS.map(([tier, label]) => (
                  <button key={tier} type="button" aria-pressed={c.held?.tier === tier} disabled={readOnly} className={pill(c.held?.tier === tier)} data-testid={`baseline-${c.key}-${tier}`}
                    onClick={() => save(setCategoryTier(baseline, c.key, tier, stamp))}>
                    {c.held?.tier === tier && <span aria-hidden="true" className="mr-1">✓</span>}{label}
                  </button>
                ))}
              </div>
              {c.held && (c.status === "open" || c.status === "part") && (
                <p className="mt-1 text-[11px] text-ink" data-testid={`baseline-text-${c.key}`}><span className="font-semibold">Blue Leaf pricing assumption ({BASELINE_TIERS[c.held.tier]}{assumptionIsDraft(c.held) ? ", draft wording" : ""}):</span> {c.assumptionText}</p>
              )}
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

/** Staff-only list of what the chosen performance goals may prompt someone to review. Shows only while a goal is chosen. */
export function PerformanceReview({ item }) {
  const groups = performanceSuggestions(item?.answer);
  if (!groups.length) return null;
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900" data-testid="review-W-016">
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="font-semibold">For technical review</p>
        <Chip tone="amber">Review required</Chip>
        <Chip tone="amber">Staff only</Chip>
      </div>
      <p className="mt-0.5 leading-snug">{REVIEW_DISCLAIMER}</p>
      {groups.map((g) => (
        <div key={g.goal} className="mt-1.5">
          <p className="font-semibold">{g.goalLabel}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {g.suggestions.map((s) => <li key={s.id}><span className="font-medium">{s.area}:</span> {s.text}</li>)}
          </ul>
        </div>
      ))}
      <p className="mt-1.5 leading-snug"><span className="font-semibold">Confirm for this project:</span> {PERFORMANCE_REVIEW_CHECKS.join(", ")}.</p>
      {groups.some((g) => g.goal === "passive_house_target") && <p className="mt-0.5 leading-snug">{PASSIVE_HOUSE_NOTE}</p>}
    </div>
  );
}
