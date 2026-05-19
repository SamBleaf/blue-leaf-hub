import { useEffect, useState } from "react";
import { portalMediaUrl } from "../../lib/portalUtils.js";

function photoSrc(token, photo) {
  if (photo.publicUrl?.includes("/api/portal/media/")) {
    const id = photo.id || photo.publicUrl.split("/").pop()?.split("?")[0];
    return portalMediaUrl(token, id);
  }
  return photo.publicUrl || "";
}

export default function PhotoGrid({ photos = [], columns = 3, token }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const cols = columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3";

  useEffect(() => {
    if (selectedIndex == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowLeft") setSelectedIndex((i) => (i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") setSelectedIndex((i) => (i < photos.length - 1 ? i + 1 : i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIndex, photos.length]);

  if (!photos.length) return null;

  const selected = selectedIndex != null ? photos[selectedIndex] : null;

  return (
    <>
      <div className={`grid gap-2 ${cols}`}>
        {photos.map((p, i) => (
          <button
            key={p.id || i}
            type="button"
            className="rounded-xl overflow-hidden aspect-square relative group cursor-pointer border-0 p-0"
            onClick={() => setSelectedIndex(i)}
          >
            <img src={photoSrc(token, p)} alt={p.caption || ""} className="w-full h-full object-cover" />
            {p.caption && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-end p-2">
                <span className="text-xs text-white truncate">{p.caption}</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4"
          onClick={() => setSelectedIndex(null)}
          role="presentation"
        >
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-3xl"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndex((i) => (i > 0 ? i - 1 : i));
            }}
          >
            ‹
          </button>
          <img
            src={photoSrc(token, selected)}
            alt={selected.caption || ""}
            className="max-h-[85vh] max-w-[85vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {selected.caption && (
            <p className="text-sm text-white/70 mt-3 text-center">{selected.caption}</p>
          )}
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-3xl"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndex((i) => (i < photos.length - 1 ? i + 1 : i));
            }}
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}
