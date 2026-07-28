import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

async function readApiJson(res) {
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new Error(`HTTP ${res.status}: empty response`);
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: response was not JSON (${text.slice(0, 160).replace(/\s+/g, " ")})`);
  }
}

const TRADES = ["Carpenter", "Electrician", "Plumber", "HVAC", "Tiler", "Painter", "Plasterer", "Concreter", "Roofer", "Labourer", "Other"];

const RULES = [
  "Wear full PPE at all times — hard hat, hi-vis vest, steel-capped boots",
  "No alcohol, drugs, or impairment on site at any time",
  "Report all hazards, near-misses, and incidents immediately to the supervisor",
  "No mobile phone use while operating plant or machinery",
  "Respect neighbouring properties — no noise before 7am or after 6pm",
  "Follow all directions from the site supervisor"
];

export default function SiteInduction() {
  const { projectId } = useParams();
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState("");
  const [swmsList, setSwmsList] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [trade, setTrade] = useState("Carpenter");
  const [mobile, setMobile] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");

  const [rules, setRules] = useState(() => RULES.map(() => false));
  const [swmsAck, setSwmsAck] = useState({});

  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [done, setDone] = useState(false);

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true);
    setError("");
    try {
      const res = await fetch(`/api/induction/${projectId}/info`);
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not load project.");
      setAddress(j.address || "");
      setSwmsList(Array.isArray(j.swms) ? j.swms : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoadingInfo(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const filteredSwms = useMemo(
    () =>
      swmsList.filter((s) => {
        const a = String(s.trade || "").toLowerCase();
        const b = trade.toLowerCase();
        return a.includes(b) || b.includes(a) || trade === "Other";
      }),
    [swmsList, trade]
  );

  useEffect(() => {
    const next = {};
    filteredSwms.forEach((s) => {
      next[s.id] = false;
    });
    setSwmsAck(next);
  }, [filteredSwms]);

  function step1Valid() {
    return firstName.trim() && lastName.trim() && company.trim() && mobile.trim() && emName.trim() && emPhone.trim();
  }

  const allRules = rules.every(Boolean);
  const allSwms = filteredSwms.length === 0 || filteredSwms.every((s) => swmsAck[s.id]);

  function pos(ev, canvas) {
    const r = canvas.getBoundingClientRect();
    const x = ("touches" in ev ? ev.touches[0].clientX : ev.clientX) - r.left;
    const y = ("touches" in ev ? ev.touches[0].clientY : ev.clientY) - r.top;
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return { x: x * sx, y: y * sy };
  }

  function startDraw(ev) {
    ev.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    const ctx = c.getContext("2d");
    const { x, y } = pos(ev, c);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function moveDraw(ev) {
    if (!drawing.current) return;
    ev.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const { x, y } = pos(ev, c);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasInk(true);
  }

  function endDraw() {
    drawing.current = false;
  }

  function clearCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  async function submit() {
    const c = canvasRef.current;
    if (!c) return;
    setSubmitBusy(true);
    setError("");
    try {
      const dataUrl = c.toDataURL("image/jpeg", 0.82);
      const res = await fetch(`/api/induction/${projectId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          company: company.trim(),
          trade,
          mobile: mobile.trim(),
          emergencyContactName: emName.trim(),
          emergencyContactPhone: emPhone.trim(),
          // Real captured acknowledgement — NOT hardcoded. The wizard already gates progression on
          // every rule + SWMS being ticked, so these reflect what the worker actually confirmed.
          siteRulesAcknowledged: allRules,
          swmsAcknowledged: allSwms,
          acknowledgedSwms: filteredSwms.filter((s) => swmsAck[s.id]).map((s) => ({ id: s.id, title: s.title })),
          signatureDataUrl: dataUrl,
          ipAddress: ""
        })
      });
      const j = await readApiJson(res);
      if (!res.ok || !j.ok) throw new Error(j.error || "Submit failed");
      setDone(true);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSubmitBusy(false);
    }
  }

  if (loadingInfo && !error) {
    return (
      <div className="min-h-screen bg-page p-6">
        <p className="text-lg text-muted">Loading…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-page p-8 text-center">
        <div className="mx-auto max-w-md rounded-card border border-accent/40 bg-surface p-8 shadow-lg">
          <div className="text-6xl text-accent">✓</div>
          <h1 className="mt-4 text-2xl font-bold text-primary">You&apos;re signed in. Stay safe out there.</h1>
          <p className="mt-3 text-muted">{address}</p>
          <p className="mt-2 text-sm text-muted">{new Date().toLocaleString("en-AU")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page px-4 py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex justify-center gap-2 text-sm font-semibold text-muted">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`rounded-full px-3 py-1 ${step === n ? "bg-primary text-white" : "bg-surface border border-hairline"}`}>
              {n}
            </span>
          ))}
        </div>

        {error ? <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div> : null}

        {step === 1 ? (
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm space-y-4">
            <h1 className="text-xl font-bold text-primary">Your details</h1>
            <label className="block text-sm font-semibold text-muted">
              First name
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Last name
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Company
              <input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Trade
              <select value={trade} onChange={(e) => setTrade(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base">
                {TRADES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-muted">
              Mobile
              <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Emergency contact name
              <input value={emName} onChange={(e) => setEmName(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base" />
            </label>
            <label className="block text-sm font-semibold text-muted">
              Emergency contact phone
              <input type="tel" value={emPhone} onChange={(e) => setEmPhone(e.target.value)} className="mt-1 w-full min-h-[48px] rounded-lg border border-hairline px-3 text-base" />
            </label>
            <button type="button" disabled={!step1Valid()} onClick={() => setStep(2)} className="w-full min-h-[52px] rounded-lg bg-primary py-3 text-base font-semibold text-white disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm space-y-4">
            <h1 className="text-xl font-bold text-primary">Site rules</h1>
            <p className="text-sm text-muted">{address}</p>
            <div className="space-y-3">
              {RULES.map((text, i) => (
                <label key={i} className="flex gap-3 rounded-lg border border-hairline bg-page p-4 text-sm">
                  <input type="checkbox" checked={rules[i]} onChange={(e) => setRules((r) => r.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-1 h-5 w-5" />
                  <span>{text}</span>
                </label>
              ))}
            </div>
            {allRules ? <div className="rounded-full bg-accent/15 px-3 py-1 text-center text-xs font-bold text-accent">All rules acknowledged</div> : null}
            <button type="button" disabled={!allRules} onClick={() => setStep(3)} className="w-full min-h-[52px] rounded-lg bg-primary py-3 text-base font-semibold text-white disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm space-y-4">
            <h1 className="text-xl font-bold text-primary">SWMS</h1>
            {filteredSwms.length === 0 ? (
              <p className="text-muted">No specific SWMS required for your trade on this project. Proceed to signature.</p>
            ) : (
              <div className="space-y-3">
                {filteredSwms.map((s) => (
                  <div key={s.id} className="rounded-lg border border-hairline bg-page p-4">
                    <div className="font-semibold text-ink">{s.title}</div>
                    {s.pdf_path ? (
                      <a href={s.pdf_path.startsWith("http") ? s.pdf_path : "#"} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-primary underline">
                        View SWMS (PDF)
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-muted">PDF not linked.</p>
                    )}
                    <label className="mt-3 flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={Boolean(swmsAck[s.id])} onChange={(e) => setSwmsAck((m) => ({ ...m, [s.id]: e.target.checked }))} className="mt-1 h-5 w-5" />I have read and understood this Safe Work Method Statement
                    </label>
                  </div>
                ))}
              </div>
            )}
            <button type="button" disabled={!allSwms} onClick={() => setStep(4)} className="w-full min-h-[52px] rounded-lg bg-primary py-3 text-base font-semibold text-white disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-sm space-y-4">
            <h1 className="text-xl font-bold text-primary">Signature</h1>
            <p className="text-sm text-muted">Sign below to confirm your induction</p>
            <canvas
              ref={canvasRef}
              width={300}
              height={150}
              className="touch-none w-full max-w-[300px] rounded-lg border-2 border-hairline bg-white"
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
            />
            <button type="button" onClick={clearCanvas} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold">
              Clear
            </button>
            <button type="button" disabled={!hasInk || submitBusy} onClick={submit} className="w-full min-h-[52px] rounded-lg bg-accent py-3 text-base font-semibold text-white disabled:opacity-40">
              {submitBusy ? "Submitting…" : "Sign & Submit"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
