import LeafWatermark from "./LeafWatermark.jsx";

export default function PortalBrandFrame({
  children,
  watermark = "bottom-right",
  watermarkOpacity = 0.12,
  className = ""
}) {
  return (
    <div className={`relative isolate min-h-[50vh] ${className}`}>
      <LeafWatermark position={watermark} opacity={watermarkOpacity} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
