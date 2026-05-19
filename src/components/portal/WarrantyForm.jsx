import { useState } from "react";

const AREAS = [
  "Kitchen",
  "Living Room",
  "Master Bedroom",
  "Ensuite",
  "Main Bathroom",
  "Laundry",
  "Garage",
  "External",
  "Other"
];

export default function WarrantyForm({ onSubmit }) {
  const [area, setArea] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("can_wait");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!area) next.area = true;
    if (!description.trim()) next.description = true;
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ area, description: description.trim(), urgency, photoUrls: [] });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p className="text-sm text-success font-medium">
        Your item has been submitted. Sam will be in touch.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-ink block mb-1">Area</label>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className={`w-full rounded-lg border px-3 py-2 text-sm bg-surface ${
            errors.area ? "border-danger" : "border-hairline"
          }`}
        >
          <option value="">Select area…</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-ink block mb-1">Description</label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue…"
          className={`w-full rounded-lg border px-3 py-2 text-sm resize-none ${
            errors.description ? "border-danger" : "border-hairline"
          }`}
        />
      </div>
      <div>
        <span className="text-sm font-medium text-ink block mb-2">Urgency</span>
        <div className="flex flex-wrap gap-4">
          {[
            ["can_wait", "Can wait"],
            ["this_week", "This week"],
            ["urgent", "Urgent"]
          ].map(([val, lab]) => (
            <label key={val} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="urgency"
                value={val}
                checked={urgency === val}
                onChange={() => setUrgency(val)}
              />
              {lab}
            </label>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting || !area || !description.trim()}
        className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold w-full disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit warranty item"}
      </button>
    </form>
  );
}
