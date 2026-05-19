import { BRAND_ICON_BLUE } from "../../lib/brandAssets.js";

export default function BrandLoading({ message = "Loading…", className = "" }) {
  return (
    <div
      className={`flex min-h-screen flex-col items-center justify-center gap-5 bg-page px-4 ${className}`}
      role="status"
      aria-live="polite"
    >
      <img
        src={BRAND_ICON_BLUE}
        alt=""
        className="brand-knockout h-14 w-auto opacity-[0.12] blur-[0.5px]"
        draggable={false}
      />
      {message ? <p className="text-sm text-muted tracking-wide">{message}</p> : null}
    </div>
  );
}
