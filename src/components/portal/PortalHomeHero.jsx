import HeroBackdrop from "../brand/HeroBackdrop.jsx";
import { greetingByHour, formatPortalDate, PORTAL_CHROME } from "../../lib/portalUtils.js";
import ProgressBar from "./ProgressBar.jsx";

export default function PortalHomeHero({ clientName, address, percent, completionDateEst }) {
  const name = clientName?.trim() || "there";

  return (
    <section
      className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br px-6 py-8 text-white shadow-lg"
      style={{
        backgroundImage: `linear-gradient(to bottom right, ${PORTAL_CHROME.base}, ${PORTAL_CHROME.mid}, ${PORTAL_CHROME.dark})`
      }}
    >
      <HeroBackdrop position="top-right" opacity={0.14} />
      <div className="relative z-10">
        {address ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 truncate">
            {address}
          </p>
        ) : null}
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight leading-tight">
          {greetingByHour()}, {name}.
        </h1>
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
            <span className="text-white/70">Project progress</span>
            <span className="text-lg font-semibold tabular-nums">{percent}%</span>
          </div>
          <ProgressBar percent={percent} tone="onDark" />
        </div>
        {completionDateEst ? (
          <p className="mt-3 text-xs text-white/50">
            Estimated completion {formatPortalDate(completionDateEst)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
