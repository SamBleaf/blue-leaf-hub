import { useState } from "react";
import PortalEmptyState from "./PortalEmptyState.jsx";
import { formatPortalDate } from "../../lib/portalUtils.js";

export default function SiteWalkBooker({ siteWalks = [], onBook }) {
  const [selectedId, setSelectedId] = useState(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);

  if (!siteWalks.length) {
    return (
      <PortalEmptyState
        title="No site walks available"
        message="Sam will add available dates soon."
      />
    );
  }

  const handleBook = async () => {
    if (!selectedId) return;
    setBooking(true);
    try {
      await onBook(selectedId);
      setBooked(true);
    } finally {
      setBooking(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {siteWalks.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setSelectedId(w.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              selectedId === w.id
                ? "bg-primary text-white border-primary"
                : "bg-surface text-ink border-hairline hover:border-primary"
            }`}
          >
            {formatPortalDate(w.availableDate)}
          </button>
        ))}
      </div>
      {booked ? (
        <p className="text-sm text-success font-medium">
          Booking requested! Sam will confirm within 24 hours.
        </p>
      ) : (
        selectedId && (
          <button
            type="button"
            disabled={booking}
            onClick={handleBook}
            className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {booking ? "Booking…" : "Confirm booking"}
          </button>
        )
      )}
    </div>
  );
}
