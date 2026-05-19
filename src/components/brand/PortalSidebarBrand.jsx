import { BRAND_ICON_WHITE } from "../../lib/brandAssets.js";

/**
 * Client portal sidebar — white icon only, then site address + builder name.
 */
export default function PortalSidebarBrand({ address }) {
  return (
    <div className="flex flex-col gap-3">
      <img
        src={BRAND_ICON_WHITE}
        alt=""
        aria-hidden
        className="brand-knockout h-10 w-auto shrink-0"
        draggable={false}
      />
      <div className="min-w-0">
        {address ? (
          <p className="text-sm font-medium leading-snug text-white/95 truncate">{address}</p>
        ) : null}
        <p className="mt-0.5 text-[11px] font-medium tracking-wide text-white/50">Blue Leaf Building</p>
      </div>
    </div>
  );
}
