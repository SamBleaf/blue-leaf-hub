/**
 * StickyActionBar — a bottom-pinned bar carrying a detail page's primary action so
 * it's always reachable (especially on mobile). Presentational; pass buttons as
 * children. Pair with <SafeBottomSpacer /> at the end of the page so it never
 * covers content. Honours the iOS safe-area inset.
 *
 * `position="sticky"` (default) flows at the bottom of its scroll container;
 * `position="fixed"` pins to the viewport bottom.
 *
 * <StickyActionBar><button…>Advance</button></StickyActionBar>
 */
export default function StickyActionBar({ children, position = "sticky", className = "" }) {
  const pos = position === "fixed" ? "fixed inset-x-0 bottom-0" : "sticky bottom-0";
  return (
    <div
      className={`${pos} z-30 border-t border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 ${className}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">{children}</div>
    </div>
  );
}
