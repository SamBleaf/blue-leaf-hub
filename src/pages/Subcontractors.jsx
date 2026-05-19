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

const CSV_TEMPLATE_HEADERS = [
  "business_name",
  "email",
  "trade",
  "contact",
  "mobile",
  "abn",
  "address",
  "suburb",
  "state",
  "postcode"
];

const CSV_TEMPLATE_ROWS = [
  {
    business_name: "Example Plumbing Co",
    email: "admin@exampleplumbing.com.au",
    trade: "plumbing",
    contact: "Alex Smith",
    mobile: "0400 000 000",
    abn: "12 345 678 901",
    address: "12 Example Street",
    suburb: "Norwood",
    state: "SA",
    postcode: "5067"
  },
  {
    business_name: "Example Electrical",
    email: "quotes@exampleelectrical.com.au",
    trade: "electrical",
    contact: "Jamie Brown",
    mobile: "0400 111 111",
    abn: "",
    address: "",
    suburb: "Adelaide",
    state: "SA",
    postcode: "5000"
  }
];

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows) {
  return [CSV_TEMPLATE_HEADERS, ...rows.map((row) => CSV_TEMPLATE_HEADERS.map((h) => row[h] ?? ""))]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((v) => String(v || "").trim()));
}

function normaliseCsvHeader(header) {
  return String(header || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

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

function EditModal({ sub, onClose, onSaved, tradesList }) {
  const [form, setForm] = useState({
    business_name: sub.business_name || "",
    email: sub.email || "",
    trade: sub.trade || "",
    contact: sub.contact || "",
    mobile: sub.mobile || "",
    abn: sub.abn || "",
    address: sub.address || "",
    suburb: sub.suburb || "",
    state: sub.state || "SA",
    postcode: sub.postcode || ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const bind = (field) => ({
    value: form[field],
    onChange: (e) => { setForm((p) => ({ ...p, [field]: e.target.value })); setError(""); }
  });

  const handleSave = async () => {
    if (!form.business_name.trim() || !form.email.trim() || !form.trade) {
      setError("Business Name, Email and Trade are required.");
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from("subcontractors").update({
      business_name: form.business_name.trim(),
      email: form.email.trim(),
      trade: form.trade,
      contact: form.contact.trim() || null,
      mobile: form.mobile.trim() || null,
      abn: form.abn.trim() || null,
      address: form.address.trim() || null,
      suburb: form.suburb.trim() || null,
      state: form.state || "SA",
      postcode: form.postcode.trim() || null,
    }).eq("id", sub.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ background: "#006c9b", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Edit Subcontractor</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{sub.business_name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ padding: 24, maxHeight: "72vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#006c9b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Required</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={labelStyle}>Business Name <span style={{ color: "#dc2626" }}>*</span></label>
                <input {...bind("business_name")} placeholder="e.g. Andrew Evans Plumbing" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email <span style={{ color: "#dc2626" }}>*</span></label>
                <input {...bind("email")} type="email" placeholder="e.g. admin@business.com.au" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Trade <span style={{ color: "#dc2626" }}>*</span></label>
                <select {...bind("trade")} style={inputStyle}>
                  <option value="">Select trade...</option>
                  {tradesList.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Contact Details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["contact", "Contact Name", "First name"],
                ["mobile", "Mobile", "04xx xxx xxx"],
                ["abn", "ABN", "xx xxx xxx xxx"],
                ["address", "Address", "Street address"],
                ["suburb", "Suburb", "e.g. Norwood"],
                ["postcode", "Postcode", "5000"],
                ["state", "State", "SA"]
              ].map(([field, label, ph]) => (
                <div key={field}>
                  <label style={labelStyle}>{label}</label>
                  <input {...bind(field)} placeholder={ph} style={inputStyle} />
                </div>
              ))}
            </div>
          </div>

          {error && <div style={{ color: "#dc2626", fontSize: 13, background: "#fee2e2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={btnSecondary}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>
              {saving ? "Saving…" : "Save changes"}
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

function BulkImportModal({ onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const templateCsv = rowsToCsv(CSV_TEMPLATE_ROWS);

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "blue-leaf-subcontractors-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openGoogleSheetsTemplate = async () => {
    const sheetWindow = window.open("about:blank", "_blank");
    if (sheetWindow) {
      sheetWindow.opener = null;
      sheetWindow.document.write("<p style=\"font-family:sans-serif;padding:24px\">Creating Blue Leaf subcontractor template...</p>");
    }
    try {
      const res = await fetch("/api/subcontractors/csv-template-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: templateCsv })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not create Google Sheet.");
      if (sheetWindow) sheetWindow.location.href = data.editUrl || data.webViewLink;
      else window.open(data.editUrl || data.webViewLink, "_blank", "noopener,noreferrer");
      setError("Google Sheet template created. Fill the rows, then download as CSV and upload it below.");
    } catch (err) {
      if (sheetWindow) sheetWindow.close();
      downloadTemplate();
      try {
        await navigator.clipboard.writeText(templateCsv);
        window.open("https://docs.google.com/spreadsheets/create", "_blank", "noopener,noreferrer");
        setError(`${err?.message || "Drive template unavailable"} CSV template downloaded and copied. Open the downloaded CSV in Google Sheets, or paste into cell A1.`);
      } catch {
        window.open("https://docs.google.com/spreadsheets/create", "_blank", "noopener,noreferrer");
        setError(`${err?.message || "Drive template unavailable"} CSV template downloaded. Open that file in Google Sheets to continue.`);
      }
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setRows([]);
      setError("CSV must include a header row and at least one subcontractor row.");
      return;
    }
    const headers = parsed[0].map(normaliseCsvHeader);
    const required = ["business_name", "email", "trade"];
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length) {
      setRows([]);
      setError(`Missing required columns: ${missing.join(", ")}.`);
      return;
    }
    const mapped = parsed.slice(1).map((cells, idx) => {
      const row = {};
      headers.forEach((h, i) => {
        if (CSV_TEMPLATE_HEADERS.includes(h)) row[h] = String(cells[i] || "").trim();
      });
      return { ...EMPTY_FORM, ...row, state: row.state || "SA", _row: idx + 2 };
    });
    const valid = mapped.filter((r) => r.business_name && r.email && r.trade);
    const skipped = mapped.length - valid.length;
    setRows(valid);
    setError(skipped ? `${skipped} row${skipped === 1 ? "" : "s"} skipped because Business Name, Email or Trade was blank.` : "");
  };

  const saveRows = async () => {
    if (!rows.length) {
      setError("Upload a CSV with at least one valid subcontractor.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = rows.map(({ _row, ...row }) => ({
      ...row,
      abn: row.abn || null,
      address: row.address || null,
      suburb: row.suburb || null,
      postcode: row.postcode || null,
      contact: row.contact || null,
      mobile: row.mobile || null
    }));
    const { error: err } = await supabase.from("subcontractors").insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
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
        zIndex: 55,
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
          maxWidth: 680,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden"
        }}
      >
        <div style={{ background: "#006c9b", padding: "18px 24px", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Import Subcontractors from CSV</div>
            <div style={{ color: "#cbd5e1", fontSize: 12, marginTop: 2 }}>Use the Google Sheets template to add multiple rows at once.</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#cbd5e1", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 0 }}>
            x
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: "74vh", overflowY: "auto" }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
              Columns are pre-formatted for Blue Leaf Hub:
              <strong> business_name, email, trade, contact, mobile, abn, address, suburb, state, postcode</strong>.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={openGoogleSheetsTemplate} style={btnPrimary}>
                Open Template in Google Sheets
              </button>
              <button type="button" onClick={downloadTemplate} style={btnSecondary}>
                Download CSV Template
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Upload completed CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleFile(file);
              }}
              style={{ ...inputStyle, padding: 8 }}
            />
          </div>

          {error ? (
            <div style={{ marginTop: 12, color: "#b45309", fontSize: 13, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "9px 12px" }}>
              {error}
            </div>
          ) : null}

          {rows.length ? (
            <div style={{ marginTop: 16, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: "#f8fafc", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#006c9b" }}>
                Preview: {rows.length} subcontractor{rows.length === 1 ? "" : "s"} ready to import
              </div>
              <div style={{ overflowX: "auto", maxHeight: 240 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Business", "Email", "Trade", "Contact", "Suburb"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((row) => (
                      <tr key={`${row._row}-${row.email}`}>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>{row.business_name}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.email}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.trade}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.contact}</td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>{row.suburb}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 ? <div style={{ padding: "8px 10px", fontSize: 12, color: "#64748b" }}>Only first 8 rows shown.</div> : null}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancel
            </button>
            <button type="button" onClick={saveRows} disabled={saving || !rows.length} style={{ ...btnPrimary, flex: 1, opacity: !rows.length ? 0.5 : 1 }}>
              {saving ? "Importing..." : `Import ${rows.length || ""} subcontractors`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubCard({ sub, colourMap, onEdit }) {
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
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(sub); }}
            title="Edit"
            style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 7px", cursor: "pointer", fontSize: 12, color: "#64748b", lineHeight: 1 }}
          >
            ✎
          </button>
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

function formatCurrency(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function quoteAmount(row) {
  const amount = Number(row?.quote_amount ?? row?.quoted_amount);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function buildSubStats(sub, rfqs) {
  const rows = (rfqs || []).filter((r) => r.subcontractor_id === sub.id);
  const received = rows.filter((r) => ["received", "accepted"].includes(r.status));
  const accepted = rows.filter((r) => r.status === "accepted");
  const quotedAmounts = rows.map(quoteAmount).filter((n) => n != null);
  const totalQuoted = quotedAmounts.reduce((sum, n) => sum + n, 0);
  const avgQuote = quotedAmounts.length ? totalQuoted / quotedAmounts.length : 0;
  const quoteUploads = rows.filter((r) => r.quote_pdf_path || r.quote_pdf_url || r.dropbox_pdf_url).length;
  return {
    rows,
    rfqCount: rows.length,
    receivedCount: received.length,
    acceptedCount: accepted.length,
    quoteUploads,
    totalQuoted,
    avgQuote,
    winRate: rows.length ? Math.round((accepted.length / rows.length) * 100) : 0,
    responseRate: rows.length ? Math.round((received.length / rows.length) * 100) : 0,
    lastUsed: rows
      .map((r) => r.sent_at || r.created_at)
      .filter(Boolean)
      .sort()
      .at(-1) || null
  };
}

function sheetSortValue(sub, stats, key) {
  if (key === "business") return sub.business_name || "";
  if (key === "trade") return sub.trade || "";
  if (key === "contact") return sub.contact || "";
  if (key === "email") return sub.email || "";
  if (key === "mobile") return sub.mobile || "";
  if (key === "suburb") return `${sub.suburb || ""} ${sub.state || ""}`;
  if (key === "rfqs") return stats.rfqCount;
  if (key === "uploaded") return stats.quoteUploads;
  if (key === "accepted") return stats.acceptedCount;
  if (key === "avg_quote") return stats.avgQuote;
  if (key === "missing") return ["contact", "mobile", "abn", "address"].filter((f) => !sub[f]).length;
  return "";
}

function SortableTableHead({ label, sortKey, activeSort, onSort }) {
  const active = activeSort?.key === sortKey;
  const icon = active ? (activeSort.direction === "asc" ? "▲" : "▼") : "↕";
  return (
    <th style={tableHeadCell}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          background: "transparent",
          color: active ? "#006c9b" : "#64748b",
          cursor: "pointer",
          padding: 0,
          font: "inherit",
          textTransform: "inherit",
          letterSpacing: "inherit"
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>{icon}</span>
      </button>
    </th>
  );
}

function SubcontractorDashboard({ sub, rfqs, colourMap, onClose }) {
  const stats = buildSubStats(sub, rfqs);
  const recent = stats.rows
    .slice()
    .sort((a, b) => new Date(b.sent_at || b.created_at || 0) - new Date(a.sent_at || a.created_at || 0))
    .slice(0, 8);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
        background: "rgba(15,23,42,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 860, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden" }}>
        <div style={{ background: "#006c9b", padding: "18px 24px", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>{sub.business_name}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <TradeBadge trade={sub.trade || "unknown"} colourMap={colourMap} />
              <span style={{ color: "#cbd5e1", fontSize: 12 }}>{sub.contact || "No contact"} {sub.mobile ? `- ${sub.mobile}` : ""}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#cbd5e1", fontSize: 24, cursor: "pointer", lineHeight: 1, padding: 0 }}>
            x
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: "76vh", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
            {[
              ["RFQs sent", stats.rfqCount],
              ["Quotes uploaded", stats.quoteUploads],
              ["Accepted", stats.acceptedCount],
              ["Response rate", `${stats.responseRate}%`],
              ["Win rate", `${stats.winRate}%`],
              ["Avg quote", formatCurrency(stats.avgQuote)]
            ].map(([label, value]) => (
              <div key={label} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#f8fafc" }}>
                <div style={{ color: "#006c9b", fontSize: 20, fontWeight: 800 }}>{value}</div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>Contact</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                <div>Email: {sub.email || "-"}</div>
                <div>Mobile: {sub.mobile || "-"}</div>
                <div>ABN: {sub.abn || "-"}</div>
                <div>Location: {[sub.suburb, sub.state, sub.postcode].filter(Boolean).join(" ") || "-"}</div>
              </div>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>Useful metrics</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                <div>Total quoted: {formatCurrency(stats.totalQuoted)}</div>
                <div>Last used: {stats.lastUsed ? new Date(stats.lastUsed).toLocaleDateString("en-AU") : "-"}</div>
                <div>Missing fields: {["contact", "mobile", "abn", "address"].filter((f) => !sub[f]).length}</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ background: "#f8fafc", padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#006c9b" }}>Recent quotes and RFQs</div>
            {recent.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Job", "Trade", "Status", "Amount", "PDF", "Sent"].map((h) => (
                        <th key={h} style={tableHeadCell}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => {
                      const pdf = r.quote_pdf_url || r.dropbox_pdf_url || "";
                      return (
                        <tr key={r.id}>
                          <td style={tableCell}>{r.jobs?.address || "-"}</td>
                          <td style={tableCell}>{r.trade || "-"}</td>
                          <td style={tableCell}>{r.status || "-"}</td>
                          <td style={tableCell}>{formatCurrency(quoteAmount(r))}</td>
                          <td style={tableCell}>
                            {pdf ? <a href={pdf} target="_blank" rel="noopener noreferrer" style={{ color: "#006c9b", fontWeight: 700 }}>Open</a> : r.quote_pdf_path ? "Saved" : "-"}
                          </td>
                          <td style={tableCell}>{r.sent_at ? new Date(r.sent_at).toLocaleDateString("en-AU") : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 18, color: "#94a3b8", fontSize: 13 }}>No RFQs or quote uploads found for this subcontractor yet.</div>
            )}
          </div>
        </div>
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
  const [rfqs, setRfqs] = useState([]);
  const [customTrades, setCustomTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("az");
  const [viewMode, setViewMode] = useState("cards");
  const [sheetSort, setSheetSort] = useState({ key: "business", direction: "asc" });
  const [selectedSub, setSelectedSub] = useState(null);
  const [editingSub, setEditingSub] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
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

    const rRes = await supabase
      .from("rfqs")
      .select("id, subcontractor_id, job_id, trade, status, quote_amount, quoted_amount, quote_pdf_path, quote_pdf_url, dropbox_pdf_url, sent_at, received_at, created_at, jobs(address)")
      .order("created_at", { ascending: false })
      .limit(2000);
    setRfqs(rRes.error ? [] : rRes.data || []);

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

  const sheetColumns = [
    ["business", "Business"],
    ["trade", "Trade"],
    ["contact", "Contact"],
    ["email", "Email"],
    ["mobile", "Mobile"],
    ["suburb", "Suburb"],
    ["rfqs", "RFQs"],
    ["uploaded", "Uploaded"],
    ["accepted", "Accepted"],
    ["avg_quote", "Avg quote"],
    ["missing", "Missing"]
  ];

  const toggleSheetSort = (key) => {
    setSheetSort((cur) => ({
      key,
      direction: cur.key === key && cur.direction === "asc" ? "desc" : "asc"
    }));
  };

  const sheetSorted = [...filtered].sort((a, b) => {
    const aStats = buildSubStats(a, rfqs);
    const bStats = buildSubStats(b, rfqs);
    const av = sheetSortValue(a, aStats, sheetSort.key);
    const bv = sheetSortValue(b, bStats, sheetSort.key);
    const dir = sheetSort.direction === "asc" ? 1 : -1;
    if (typeof av === "number" || typeof bv === "number") return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
    return String(av || "").localeCompare(String(bv || ""), undefined, { sensitivity: "base", numeric: true }) * dir;
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
              <button
                type="button"
                onClick={() => {
                  setAddMenuOpen(false);
                  setShowBulkImportModal(true);
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ border: "1px solid #cbd5e1", borderRadius: 5, padding: "1px 5px", fontSize: 10, color: "#006c9b" }}>CSV</span>
                  Import from CSV
                </span>
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

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
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
        <div style={{ display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          {[
            ["cards", "Cards"],
            ["sheet", "Spreadsheet"]
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewMode(id)}
              style={{
                border: "none",
                borderLeft: id === "sheet" ? "1px solid #cbd5e1" : "none",
                background: viewMode === id ? "#006c9b" : "#fff",
                color: viewMode === id ? "#fff" : "#334155",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              {label}
            </button>
          ))}
        </div>
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

      {!loading && !error && sorted.length > 0 && viewMode === "cards" && sortBy !== "trade" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
          {sorted.map((sub) => (
            <SubCard key={sub.id} sub={sub} colourMap={colourMap} onEdit={setEditingSub} />
          ))}
        </div>
      )}

      {!loading && !error && viewMode === "cards" && sortBy === "trade" && (
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
                    <SubCard key={sub.id} sub={sub} colourMap={colourMap} onEdit={setEditingSub} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && sorted.length > 0 && viewMode === "sheet" && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 24px rgba(15,23,42,0.04)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {sheetColumns.map(([key, label]) => (
                    <SortableTableHead key={key} label={label} sortKey={key} activeSort={sheetSort} onSort={toggleSheetSort} />
                  ))}
                  <th style={tableHeadCell} />
                </tr>
              </thead>
              <tbody>
                {sheetSorted.map((sub) => {
                  const stats = buildSubStats(sub, rfqs);
                  const missing = ["contact", "mobile", "abn", "address"].filter((f) => !sub[f]).length;
                  return (
                    <tr key={sub.id} style={{ background: selectedSub?.id === sub.id ? "#f0f9ff" : "#fff" }}>
                      <td style={{ ...tableCell, minWidth: 220 }}>
                        <button
                          type="button"
                          onClick={() => setSelectedSub(sub)}
                          style={{ border: "none", background: "transparent", color: "#006c9b", fontWeight: 800, cursor: "pointer", padding: 0, textAlign: "left", font: "inherit" }}
                        >
                          {sub.business_name}
                        </button>
                      </td>
                      <td style={tableCell}><TradeBadge trade={sub.trade || "unknown"} colourMap={colourMap} /></td>
                      <td style={tableCell}>{sub.contact || "-"}</td>
                      <td style={tableCell}>{sub.email || "-"}</td>
                      <td style={tableCell}>{sub.mobile || "-"}</td>
                      <td style={tableCell}>{[sub.suburb, sub.state].filter(Boolean).join(", ") || "-"}</td>
                      <td style={tableCell}>{stats.rfqCount}</td>
                      <td style={tableCell}>{stats.quoteUploads}</td>
                      <td style={tableCell}>{stats.acceptedCount}</td>
                      <td style={tableCell}>{formatCurrency(stats.avgQuote)}</td>
                      <td style={tableCell}>{missing ? <MissingCount sub={sub} /> : "Complete"}</td>
                      <td style={tableCell}>
                        <button
                          type="button"
                          onClick={() => setEditingSub(sub)}
                          style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontSize: 12, color: "#64748b", fontWeight: 600, fontFamily: "inherit" }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ borderTop: "1px solid #e2e8f0", padding: "9px 12px", fontSize: 12, color: "#64748b", background: "#f8fafc" }}>
            Click a business name to open quote history and usage stats.
          </div>
        </div>
      )}

      {editingSub && (
        <EditModal sub={editingSub} onClose={() => setEditingSub(null)} onSaved={() => { loadAll(); setEditingSub(null); }} tradesList={tradesList} colourMap={colourMap} />
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
      {showBulkImportModal && (
        <BulkImportModal onClose={() => setShowBulkImportModal(false)} onSaved={loadAll} />
      )}
      {selectedSub && (
        <SubcontractorDashboard sub={selectedSub} rfqs={rfqs} colourMap={colourMap} onClose={() => setSelectedSub(null)} />
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
const tableHeadCell = {
  textAlign: "left",
  padding: "9px 10px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap"
};
const tableCell = {
  padding: "9px 10px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  verticalAlign: "middle",
  whiteSpace: "nowrap"
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
