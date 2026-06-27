/**
 * SafeBottomSpacer — reserves bottom space so a fixed bottom nav / StickyActionBar /
 * FAB never covers page content. Includes the iOS safe-area inset.
 * Presentational, zero logic.
 *
 * Put it as the last child of a scrolling page. Default ~96px + safe area.
 *
 * <SafeBottomSpacer />            // default
 * <SafeBottomSpacer height={120} />
 */
export default function SafeBottomSpacer({ height = 96 }) {
  return (
    <div
      aria-hidden="true"
      style={{ height: `calc(${height}px + env(safe-area-inset-bottom, 0px))` }}
    />
  );
}
