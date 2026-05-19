import { useCallback, useRef, useState } from "react";

export default function BeforeAfterSlider({ beforeUrl, afterUrl, beforeLabel, afterLabel }) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef(null);

  const onMove = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const startDrag = (clientX) => {
    onMove(clientX);
    const onMouseMove = (e) => onMove(e.clientX);
    const onTouchMove = (e) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    const end = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", end);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", end);
  };

  if (!beforeUrl || !afterUrl) return null;

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video rounded-2xl overflow-hidden select-none"
      onMouseDown={(e) => startDrag(e.clientX)}
      onTouchStart={(e) => e.touches[0] && startDrag(e.touches[0].clientX)}
    >
      <img src={beforeUrl} alt={beforeLabel || "Before"} className="absolute inset-0 object-cover w-full h-full" />
      <img
        src={afterUrl}
        alt={afterLabel || "After"}
        className="absolute inset-0 object-cover w-full h-full"
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      />
      <div className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10" style={{ left: `${sliderPos}%` }} />
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center cursor-ew-resize text-gray-700 text-xs"
        style={{ left: `${sliderPos}%` }}
      >
        ↔
      </div>
      {beforeLabel && (
        <span className="absolute top-3 left-3 text-xs font-semibold text-white bg-black/40 rounded px-2 py-1">
          {beforeLabel}
        </span>
      )}
      {afterLabel && (
        <span className="absolute top-3 right-3 text-xs font-semibold text-white bg-black/40 rounded px-2 py-1">
          {afterLabel}
        </span>
      )}
    </div>
  );
}
