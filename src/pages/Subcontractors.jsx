import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const BASE_TRADES = [
  "excavation",
  "demolition",
  "termite protection",
  "footings / concrete / formwork",
  "plumbing",
  "electrical",
  "internal linings",
  "stairs",
  "tiling",
  "flooring",
  "metal roofing",
  "bricklayer",
  "painting",
  "scaffolding",
  "cabinetry",
  "airconditioning",
  "heating",
  "pool works"
];

const PRESET_COLOURS = ["#006c9b", "#2E6B4F", "#D4A24C", "#DC2626", "#64748B", "#0e7490"];

const TRADE_COLORS = {
  excavation: "#92400e",
  demolition: "#7c3aed",
  "termite protection": "#065f46",
  "footings / concrete / formwork": "#1e40af",
  plumbing: "#0e7490",
  electrical: "#b45309",
  "internal linings": "#6d28d9",
  stairs: "#be185d",
  tiling: "#0f766e",
  flooring: "#78350f",
  "metal roofing": "#1f2937",
  bricklayer: "#9a3412",
  painting: "#1d4ed8",
  scaffolding: "#3f6212",
  cabinetry: "#713f12",
  airconditioning: "#0369a1",
  heating: "#c2410c",
  "pool works": "#0891b2"
};

const EMPTY_FORM = {
  business_name: "",
  email: "",
  trade: "",
  contact: "",
  mobile: "",
  abn: "",
  address: "",
  suburb: "",
  state: "SA",
  postcode: ""
};

function TradeBadge({ trade, colourMap }) {
  const color = colourMap[trade] || TRADE_COLORS[trade] || "#374151";
  return (
    <span
      style={{
        background: color + "15",
        color,
        border: `1px solid ${color}35`,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap"
      }}
    >
      {trade}
    </span>
  );
}

function MissingCount({ sub }) {
  const missing = ["contact", "mobile", "abn", "address"].filter((f) => !sub[f]).length;
  if (!missing) return null;
  return (
    <span
      style={{
        background: "#fee2e2",
        color: "#dc2626",
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 800,
        padding: "1px 7px"
      }}
    >
      {missing} missing
    </span>
  );
}

function ConfirmField({ label, value, aiSuggested }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            fontSize: 11,
            color: "#64748b",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}
        >
          {label}
        </span>
        {aiSuggested && (
          <span
            style={{
              fontSize: 10,
              color: "#2e6b4f",
              fontWeight: 700,
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 4,
              padding: "1px 5px"
            }}
          >
            AI
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: value ? "#1e293b" : "#94a3b8" }}>{value || "Could not find"}</div>
    </div>
  );
}

function AddTradeCategoryModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colour, setColour] = useState(PRESET_COLOURS[0]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = name.trim();
    if (!n) {
      setErr("Trade name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("custom_trades").insert({
      name: n,
      description: description.trim() || null,
      colour
    });
    setSaving(false);
    if (error) {
      setErr(
        error.message.includes("relation") || error.code === "42P01"
          ? "Run the custom_trades migration in Supabase (see supabase/migrations/002_custom_trades.sql)."
          : error.message
      );
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            background: "#006c9b",
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ color: "#fff", fontWeight: 700 }}>Add Trade Category</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 22 }}>
            ×
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <label style={labelStyle}>
            Trade name <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Pool fencing" />

          <label style={{ ...labelStyle, marginTop: 12 }}>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
            placeholder="Short internal note"
          />

          <div style={{ marginTop: 12 }}>
            <span style={labelStyle}>Colour</span>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {PRESET_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColour(c)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: c,
                    border: colour === c ? "3px solid #0f172a" : "2px solid #e2e8f0",
                    cursor: "pointer"
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {err ? (
            <div style={{ marginTop: 12, color: "#dc2626", fontSize: 13, background: "#fee2e2", padding: 10, borderRadius: 8 }}>
              {err}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>
              {saving ? "Saving…" : "Save category"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddModal({ onClose, onSaved, tradesList, colourMap }) {
  const [step, setStep] = useState("form");
  const [form, setForm] = useState(EMPTY_FORM);
  const [aiData, setAiData] = useState(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");

  const mandatoryLookup = form.business_name.trim() && form.email.trim();
  const mandatorySave = mandatoryLookup && form.trade;

  const handleLookup = async () => {
    if (!mandatoryLookup) {
      setError("Please fill in Business Name and Email first.");
      return;
    }
    setLooking(true);
    setError("");
    try {
      const res = await fetch("/api/subcontractor/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: form.business_name,
          email: form.email,
          trade: form.trade,
          suburb: form.suburb,
          state: form.state
        })
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setError(data?.error || "Lookup failed.");
        setAiData({ could_not_find: ["contact", "mobile", "abn", "address", "suburb", "postcode"] });
      } else {
        setAiData(data);
      }
    } catch {
      setError("Lookup failed. Please check your connection and try again.");
      setAiData({ could_not_find: ["contact", "mobile", "abn", "address", "suburb", "postcode"] });
    }
    setLooking(false);
    setStep("confirm");
  };

  const handleSave = async () => {
    if (!mandatorySave) {
      setError("Business Name, Email and Trade are required before saving.");
      setStep("form");
      return;
    }
    setStep("saving");
    const ai = aiData || {};
    const payload = {
      business_name: form.business_name.trim(),
      email: form.email.trim(),
      trade: form.trade,
      contact: form.contact || ai.contact || null,
      mobile: form.mobile || ai.mobile || null,
      abn: form.abn || ai.abn || null,
      address: form.address || ai.address || null,
      suburb: form.suburb || ai.suburb || null,
      state: form.state || ai.state || "SA",
      postcode: form.postcode || ai.postcode || null
    };
    const { error: err } = await supabase.from("subcontractors").insert(payload);
    if (err) {
      setError(err.message);
      setStep("confirm");
      return;
    }
    onSaved();
    onClose();
  };

  const isAI = (field) => aiData && aiData[field] && !form[field];
  const val = (field) => form[field] || (aiData && aiData[field]) || "";
  const couldNotFindSet = new Set(Array.isArray(aiData?.could_not_find) ? aiData.could_not_find : []);
  const foundSomething = ["contact", "mobile", "abn", "address", "suburb", "postcode", "state"].some(
    (field) => Boolean(aiData?.[field])
  );

  const bindField = (field) => ({
    value: val(field),
    onChange: (e) => {
      setForm((p) => ({ ...p, [field]: e.target.value }));
      setError("");
    }
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            background: "#006c9b",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>
              {step === "confirm" ? "Confirm Details" : "Add Subcontractor"}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
              {step === "confirm" ? "Review before saving to database" : "Business Name, Email and Trade are required"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: "72vh", overflowY: "auto" }}>
          {step === "form" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#006c9b",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 12
                  }}
                >
                  Required Fields
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>
                      Business Name <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input {...bindField("business_name")} placeholder="e.g. Andrew Evans Plumbing" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Email <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input {...bindField("email")} placeholder="e.g. admin@business.com.au" style={inputStyle} type="email" />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Trade <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <select {...bindField("trade")} style={inputStyle}>
                      <option value="">Select trade...</option>
                      {tradesList.map((t) => (
                        <option key={t} value={t}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#64748b",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 12
                  }}
                >
                  Optional — AI will try to find these
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    ["contact", "Contact Name", "First name"],
                    ["mobile", "Mobile", "04xx xxx xxx"],
                    ["abn", "ABN", "xx xxx xxx xxx"],
                    ["address", "Address", "Street address"],
                    ["suburb", "Suburb", "e.g. Norwood"],
                    ["postcode", "Postcode", "5000"],
                    ["state", "State", "SA"]
                  ].map(([name, label, ph]) => (
                    <div key={name}>
                      <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{label}</span>
                        {isAI(name) && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#166534",
                              background: "#ecfdf5",
                              border: "1px solid #86efac",
                              padding: "1px 5px",
                              borderRadius: 4,
                              fontWeight: 700
                            }}
                          >
                            AI suggested
                          </span>
                        )}
                        {couldNotFindSet.has(name) && !val(name) && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "#b45309",
                              background: "#fffbeb",
                              border: "1px solid #fcd34d",
                              padding: "1px 5px",
                              borderRadius: 4,
                              fontWeight: 700
                            }}
                          >
                            Could not find
                          </span>
                        )}
                      </label>
                      <input
                        {...bindField(name)}
                        placeholder={ph}
                        style={{
                          ...inputStyle,
                          background: isAI(name) && !form[name] ? "#ecfdf5" : "#fff",
                          borderColor: isAI(name) && !form[name] ? "#86efac" : "#cbd5e1"
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ color: "#dc2626", fontSize: 13, background: "#fee2e2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} style={btnSecondary}>
                  Cancel
                </button>
                <button onClick={handleLookup} disabled={!mandatoryLookup || looking} style={{ ...btnPrimary, flex: 1, opacity: !mandatoryLookup ? 0.5 : 1 }}>
                  {looking ? "Searching web..." : "Find Details with AI →"}
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {foundSomething ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534" }}>
                  ✓ AI found additional details — marked in green below.
                </div>
              ) : (
                <div style={{ background: "#fef9ec", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400e" }}>
                  AI couldn&apos;t find additional details. You can edit before saving.
                </div>
              )}

              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#006c9b",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 12
                  }}
                >
                  Confirmed
                </div>
                <ConfirmField label="Business Name" value={form.business_name} />
                <ConfirmField label="Email" value={form.email} />
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 4
                    }}
                  >
                    Trade
                  </div>
                  <TradeBadge trade={form.trade} colourMap={colourMap} />
                </div>
              </div>

              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#2e6b4f",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 12
                  }}
                >
                  AI Suggested / Optional Details
                </div>
                {[
                  ["contact", "Contact"],
                  ["mobile", "Mobile"],
                  ["abn", "ABN"],
                  ["address", "Address"],
                  ["suburb", "Suburb"],
                  ["postcode", "Postcode"],
                  ["state", "State"]
                ].map(([f, l]) => (
                  <ConfirmField key={f} label={l} value={val(f)} aiSuggested={isAI(f)} />
                ))}
              </div>

              {error && (
                <div style={{ color: "#dc2626", fontSize: 13, background: "#fee2e2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep("form")} style={btnSecondary}>
                  Edit before saving
                </button>
                <button onClick={handleSave} style={{ ...btnPrimary, flex: 1 }}>
                  Looks good — Save
                </button>
              </div>
            </div>
          )}

          {step === "saving" && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>Saving to database…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubCard({ sub, colourMap }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        borderLeft: `4px solid ${colourMap[sub.trade] || TRADE_COLORS[sub.trade] || "#374151"}`
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{sub.business_name}</div>
          {sub.contact && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{sub.contact}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <MissingCount sub={sub} />
          <TradeBadge trade={sub.trade || "unknown"} colourMap={colourMap} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {sub.mobile && (
          <a href={`tel:${sub.mobile}`} style={{ fontSize: 12, color: "#006c9b", textDecoration: "none" }}>
            📱 {sub.mobile}
          </a>
        )}
        {sub.email && (
          <a href={`mailto:${sub.email}`} style={{ fontSize: 12, color: "#006c9b", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ✉ {sub.email}
          </a>
        )}
        {sub.suburb && (
          <div style={{ fontSize: 12, color: "#64748b" }}>
            📍 {sub.suburb} {sub.state}
          </div>
        )}
        {sub.abn && <div style={{ fontSize: 12, color: "#64748b" }}>ABN: {sub.abn}</div>}
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { id: "az", label: "A to Z" },
  { id: "za", label: "Z to A" },
  { id: "date", label: "Date added" },
  { id: "trade", label: "Trade" }
];

export default function Subcontractors() {
  const [subs, setSubs] = useState([]);
  const [customTrades, setCustomTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("az");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);

  const tradesList = [...BASE_TRADES, ...customTrades.map((c) => c.name)];

  const colourMap = useMemo(() => {
    const m = { ...TRADE_COLORS };
    customTrades.forEach((c) => {
      m[c.name] = c.colour || "#006c9b";
    });
    return m;
  }, [customTrades]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    const sRes = await supabase.from("subcontractors").select("*").order("business_name");
    if (sRes.error) setError(sRes.error.message);
    else setSubs(sRes.data || []);

    const cRes = await supabase.from("custom_trades").select("*").order("name");
    setCustomTrades(cRes.error ? [] : cRes.data || []);

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const trades = ["all", ...Array.from(new Set(subs.map((s) => s.trade).filter(Boolean))).sort()];

  const filtered = subs.filter((s) => {
    const matchSearch =
      !search ||
      [s.business_name, s.contact, s.email, s.mobile, s.suburb].some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    const matchTrade = tradeFilter === "all" || s.trade === tradeFilter;
    return matchSearch && matchTrade;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "az") return (a.business_name || "").localeCompare(b.business_name || "", undefined, { sensitivity: "base" });
    if (sortBy === "za") return (b.business_name || "").localeCompare(a.business_name || "", undefined, { sensitivity: "base" });
    if (sortBy === "date") {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    return 0;
  });

  const grouped =
    sortBy === "trade"
      ? sorted.reduce((acc, sub) => {
          const t = sub.trade || "Uncategorised";
          if (!acc[t]) acc[t] = [];
          acc[t].push(sub);
          return acc;
        }, {})
      : null;

  const tradeKeys = grouped ? Object.keys(grouped).sort((a, b) => a.localeCompare(b)) : [];

  const missingInfo = subs.filter((s) => !s.mobile || !s.email || !s.abn).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#006c9b", margin: 0 }}>Subcontractors</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            {subs.length} contacts · {trades.length - 1} trades
            {missingInfo > 0 && (
              <span style={{ color: "#dc2626", marginLeft: 8 }}>· {missingInfo} with missing info</span>
            )}
          </p>
        </div>
        <div style={{ position: "relative" }} ref={addMenuRef}>
          <button
            type="button"
            onClick={() => setAddMenuOpen((o) => !o)}
            title="Add"
            aria-haspopup="true"
            aria-expanded={addMenuOpen}
            style={{
              ...btnPrimary,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minWidth: 46,
              height: 46,
              padding: "0 14px",
              borderRadius: 9999,
              flexShrink: 0,
              fontSize: 22,
              lineHeight: 1,
              boxShadow: "0 8px 22px rgba(27,58,92,0.28)"
            }}
          >
            +
          </button>
          {addMenuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "100%",
                marginTop: 8,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
                minWidth: 220,
                zIndex: 20,
                overflow: "hidden"
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setAddMenuOpen(false);
                  setShowAddModal(true);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px",
                  border: "none",
                  background: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Add Subcontractor
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMenuOpen(false);
                  setShowTradeModal(true);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px",
                  border: "none",
                  borderTop: "1px solid #e2e8f0",
                  background: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Add Trade Category
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone, suburb..."
          style={{ ...inputStyle, flex: 1, minWidth: 200 }}
        />
        <select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 160 }}>
          {trades.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All Trades" : t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginRight: 4 }}>Sort:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSortBy(opt.id)}
            style={{
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: sortBy === opt.id ? "2px solid #006c9b" : "1px solid #cbd5e1",
              background: sortBy === opt.id ? "#006c9b" : "#fff",
              color: sortBy === opt.id ? "#fff" : "#334155"
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
        {[
          { label: "Total", value: subs.length },
          { label: "Showing", value: filtered.length },
          { label: "Missing info", value: missingInfo, danger: missingInfo > 0 },
          { label: "Trades", value: trades.length - 1 }
        ].map((s) => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.danger ? "#dc2626" : "#006c9b" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Loading subcontractors...</div>}
      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: 16, color: "#dc2626" }}>{error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 48, color: "#94a3b8", fontSize: 14 }}>
          {search || tradeFilter !== "all" ? "No subcontractors match your search." : "No subcontractors yet — add your first one."}
        </div>
      )}

      {!loading && !error && sorted.length > 0 && sortBy !== "trade" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
          {sorted.map((sub) => (
            <SubCard key={sub.id} sub={sub} colourMap={colourMap} />
          ))}
        </div>
      )}

      {!loading && !error && sortBy === "trade" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {tradeKeys.map((tk) => (
            <div key={tk}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#006c9b",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                  borderBottom: "2px solid #e2e8f0",
                  paddingBottom: 6
                }}
              >
                {tk}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
                {grouped[tk]
                  .slice()
                  .sort((a, b) => (a.business_name || "").localeCompare(b.business_name || "", undefined, { sensitivity: "base" }))
                  .map((sub) => (
                    <SubCard key={sub.id} sub={sub} colourMap={colourMap} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddModal onClose={() => setShowAddModal(false)} onSaved={loadAll} tradesList={tradesList} colourMap={colourMap} />
      )}
      {showTradeModal && (
        <AddTradeCategoryModal
          onClose={() => setShowTradeModal(false)}
          onSaved={() => {
            loadAll();
          }}
        />
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 5,
  letterSpacing: "0.04em",
  textTransform: "uppercase"
};
const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 13,
  color: "#1e293b",
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
  fontFamily: "inherit"
};
const btnPrimary = {
  background: "#006c9b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.02em",
  fontFamily: "inherit"
};
const btnSecondary = {
  background: "#fff",
  color: "#334155",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit"
};
