import { BRAND_ICON_BLUE } from "../../lib/brandAssets.js";

export default function PortalEmptyState({ title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <img
        src={BRAND_ICON_BLUE}
        alt=""
        aria-hidden
        className="brand-mark-on-light mb-5 h-16 w-auto opacity-[0.28]"
        draggable={false}
      />
      <p className="text-base font-semibold text-ink mb-1">{title}</p>
      <p className="text-sm text-muted max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}
