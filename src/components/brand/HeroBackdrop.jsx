import { BRAND_ICON_WHITE } from "../../lib/brandAssets.js";

const POSITION = {
  "top-right": "right-[-20%] top-[-22%]",
  "bottom-right": "right-[-18%] bottom-[-28%]"
};

/**
 * Large cropped leaf on blue hero bands — white mark reads on primary blue (not blue-on-blue).
 */
export default function HeroBackdrop({ position = "top-right", opacity = 0.14 }) {
  const pos = POSITION[position] || POSITION["top-right"];

  return (
    <img
      src={BRAND_ICON_WHITE}
      alt=""
      aria-hidden
      draggable={false}
      className={`brand-mark-on-blue pointer-events-none absolute max-w-none w-[min(520px,88vw)] h-auto ${pos}`}
      style={{ opacity }}
    />
  );
}
