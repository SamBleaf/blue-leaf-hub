import { BRAND_ICON_BLUE } from "../../lib/brandAssets.js";

const POSITION = {
  "bottom-right": "right-[-16%] bottom-[-22%]",
  "top-right": "right-[-14%] top-[-18%]"
};

/** Page watermark on cream backgrounds — blue leaf. */
export default function LeafWatermark({ position = "bottom-right", opacity = 0.12 }) {
  const pos = POSITION[position] || POSITION["bottom-right"];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden z-0"
    >
      <img
        src={BRAND_ICON_BLUE}
        alt=""
        draggable={false}
        className={`brand-mark-on-light absolute max-w-none w-[min(440px,72vw)] h-auto ${pos}`}
        style={{ opacity }}
      />
    </div>
  );
}
