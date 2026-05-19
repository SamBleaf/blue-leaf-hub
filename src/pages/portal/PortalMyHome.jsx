import { useState } from "react";
import { getPortalMyHome, getWarrantyItems, submitWarrantyItem } from "../../lib/portalApi.js";
import { formatPortalDate } from "../../lib/portalUtils.js";
import { usePortalData } from "../../hooks/usePortalData.js";
import { usePortal } from "./portalContext.js";
import PortalPageSkeleton from "../../components/portal/PortalPageSkeleton.jsx";
import PortalEmptyState from "../../components/portal/PortalEmptyState.jsx";
import WarrantyForm from "../../components/portal/WarrantyForm.jsx";

export default function PortalMyHome() {
  const { token } = usePortal();
  const { data, loading, error } = usePortalData(() => getPortalMyHome(token), [token]);
  const [tab, setTab] = useState("finishes");
  const [roomFilter, setRoomFilter] = useState("all");
  const [warrantyItems, setWarrantyItems] = useState([]);

  const handover = data?.handoverDate;
  const handoverPast = handover && new Date(handover) <= new Date();

  const loadWarranty = async () => {
    const w = await getWarrantyItems(token);
    setWarrantyItems(w.items || []);
  };

  if (loading) return <PortalPageSkeleton />;
  if (error) return <PortalEmptyState title="Could not load" message={error.message} />;

  const rooms = data.rooms || [];
  const finishes = data.finishes || {};
  const displayRooms = roomFilter === "all" ? rooms : [roomFilter];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 pb-24 md:pb-8">
      <div className="flex gap-2 mb-6">
        {["finishes", "warranty"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              if (t === "warranty" && handoverPast) loadWarranty();
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize ${
              tab === t ? "bg-primary text-white" : "bg-surface border border-hairline text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "finishes" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={() => setRoomFilter("all")}
              className={`px-3 py-1 rounded-full text-sm border ${
                roomFilter === "all" ? "bg-primary text-white border-primary" : "border-hairline"
              }`}
            >
              All
            </button>
            {rooms.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoomFilter(r)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  roomFilter === r ? "bg-primary text-white border-primary" : "border-hairline"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="bg-surface rounded-2xl border border-hairline overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-page">
                  <th className="text-left p-3 font-semibold">Item</th>
                  <th className="text-left p-3 font-semibold">Selection</th>
                </tr>
              </thead>
              <tbody>
                {displayRooms.flatMap((room) =>
                  (finishes[room] || []).map((f) => (
                    <tr key={f.id} className="border-b border-hairline last:border-0">
                      <td className="p-3 text-ink">
                        <span className="text-xs text-muted block">{room}</span>
                        {f.item}
                      </td>
                      <td className="p-3">
                        <span className={f.value ? "text-ink" : "text-muted"}>
                          {f.value || "TBC"}
                        </span>
                        {(f.supplier || f.productCode) && (
                          <span className="block text-xs text-muted">
                            {[f.supplier, f.productCode].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "warranty" && (
        <>
          {!handoverPast ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-ink">
              {handover
                ? `Your handover is scheduled for ${formatPortalDate(handover)}. Warranty details will appear after handover.`
                : "Warranty details will appear after handover."}
            </div>
          ) : (
            <>
              {data.warrantyPeriods?.length > 0 && (
                <div className="bg-surface rounded-2xl border border-hairline p-4 mb-6">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                    Warranty periods
                  </p>
                  {data.warrantyPeriods.map((w) => (
                    <p key={w.id} className="text-sm py-1">
                      {w.label}: {w.years} years
                      {w.expiresDate && ` (expires ${formatPortalDate(w.expiresDate)})`}
                    </p>
                  ))}
                </div>
              )}
              <WarrantyForm
                onSubmit={async (payload) => {
                  await submitWarrantyItem(token, payload);
                  await loadWarranty();
                }}
              />
              {warrantyItems.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                    Open items
                  </p>
                  {warrantyItems.map((item) => (
                    <p key={item.id} className="text-sm py-2 border-b border-hairline">
                      {item.area}: {item.description} ({item.status})
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
