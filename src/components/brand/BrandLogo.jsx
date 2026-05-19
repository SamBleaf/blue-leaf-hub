import {
  BRAND_ICON_BLUE,
  BRAND_ICON_WHITE,
  BRAND_PRIMARY_LOGO_WHITE
} from "../../lib/brandAssets.js";

const PRIMARY_HEIGHT = {
  sidebar: "h-8 max-h-[34px] min-h-[28px]",
  auth: "h-24 max-h-28",
  lg: "h-14 max-h-[34px] min-h-[28px]"
};

/**
 * @param {{ variant: 'primary-white'|'icon-white'|'icon-blue', size?: 'sidebar'|'auth'|'lg', className?: string, alt?: string }} props
 */
export default function BrandLogo({ variant, size = "sidebar", className = "", alt }) {
  const src =
    variant === "primary-white"
      ? BRAND_PRIMARY_LOGO_WHITE
      : variant === "icon-white"
        ? BRAND_ICON_WHITE
        : BRAND_ICON_BLUE;

  const defaultAlt =
    variant === "primary-white" ? "Blue Leaf Building" : "Blue Leaf";

  const heightClass = variant === "primary-white" ? PRIMARY_HEIGHT[size] || PRIMARY_HEIGHT.sidebar : "h-10 w-auto";
  const knockout = variant !== "primary-white";

  return (
    <img
      src={src}
      alt={alt ?? defaultAlt}
      className={`object-contain object-left ${heightClass} ${knockout ? "brand-knockout" : ""} ${className}`}
      draggable={false}
    />
  );
}
