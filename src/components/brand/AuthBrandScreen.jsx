import { BRAND_PRIMARY_LOGO_DARK } from "../../lib/brandAssets.js";

/** Login / invite — centred primary logo only (no watermark, no leaf). */
export default function AuthBrandScreen({ children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4 py-12 font-sans">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <img
          src={BRAND_PRIMARY_LOGO_DARK}
          alt="Blue Leaf Building"
          className="mb-10 h-24 w-auto max-w-[min(100%,280px)] object-contain"
          draggable={false}
        />
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
