// =============================================================================
// SafetySheet — worker PWA bottom sheet for signing on to a carpentry job's site WHS pack (Phase C).
// Opened from Today's site card. Read the ONE composed pack (Parts 1–3) → tick "I've read and
// understood" → sign with a finger → recorded against that pack VERSION. A material change bumps the
// version → a fresh sign-on is required. This is the worker end of the liability-shield record.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { workerFetch } from "../../lib/workerFetch.js";

export default function SafetySheet({ jobId, jobLabel, onClose, onChanged }) {
  const [pack, setPack]     = useState(null);   // { version, issued, signed, html } | null
  const [error, setError]   = useState(null);
  const [loading, setLoad]  = useState(true);
  const [reading, setRead]  = useState(false);  // in the read-and-sign view
  const [ack, setAck]       = useState(false);
  const [busy, setBusy]     = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef(null);
  const drawing   = useRef(false);

  const load = useCallback(() => {
    setLoad(true);
    workerFetch(`/api/worker/jobs/${jobId}/whs-pack`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPack(j.pack || null); else setError(j.error || "Couldn't load the WHS pack."); })
      .catch(() => setError("Network error — try again."))
      .finally(() => setLoad(false));
  }, [jobId]);
  useEffect(() => { load(); }, [load]);

  function pos(ev, c) {
    const r = c.getBoundingClientRect();
    const t = ev.touches?.[0];
    const x = (t ? t.clientX : ev.clientX) - r.left;
    const y = (t ? t.clientY : ev.clientY) - r.top;
    return { x: x * (c.width / r.width), y: y * (c.height / r.height) };
  }
  function startDraw(ev) {
    ev.preventDefault(); const c = canvasRef.current; if (!c) return;
    drawing.current = true; const ctx = c.getContext("2d");
    const { x, y } = pos(ev, c);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function moveDraw(ev) {
    if (!drawing.current) return; ev.preventDefault();
    const c = canvasRef.current; const ctx = c.getContext("2d");
    const { x, y } = pos(ev, c); ctx.lineTo(x, y); ctx.stroke(); setHasInk(true);
  }
  function endDraw() { drawing.current = false; }
  function clearCanvas() {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d").clearRect(0, 0, c.width, c.height); setHasInk(false);
  }
  function openRead() { setRead(true); setAck(false); setHasInk(false); setError(null); setTimeout(clearCanvas, 0); }

  async function sign() {
    if (!ack || !hasInk) return;
    setBusy(true); setError(null);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.8);
      const r = await workerFetch(`/api/worker/jobs/${jobId}/whs-pack/signon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureDataUrl: dataUrl }),
      });
      const j = await r.json();
      if (j.ok) { setRead(false); load(); onChanged?.(); }
      else setError(j.error || "Couldn't record your sign-on.");
    } catch { setError("Network error — try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">{reading ? "Read & sign — Site WHS pack" : "Site WHS pack"}</h2>
            {jobLabel && <p className="text-xs text-muted truncate">{jobLabel}</p>}
          </div>
          <button onClick={reading ? () => setRead(false) : onClose} className="shrink-0 text-muted hover:text-ink text-xl leading-none" aria-label="Close">✕</button>
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-3">{error}</div>}

        {loading ? <p className="text-sm text-muted py-4">Loading…</p>
        : !pack ? <p className="text-sm text-muted py-4">No WHS pack has been prepared for this job yet.</p>
        : !pack.issued ? (
          <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-3 text-sm text-ink">
            The site WHS pack for this job is <b>not yet approved</b>. Your supervisor must have it reviewed and issued before you can sign on. Check with them before starting work.
          </div>
        ) : !reading ? (
          <>
            <div className={`rounded-lg px-3 py-2 text-sm mb-3 border ${pack.signed ? "bg-accent/10 border-accent/30" : "bg-primary/5 border-primary/30"}`}>
              {pack.signed
                ? <span className="text-accent font-semibold">✓ You&apos;ve signed this pack (v{pack.version}).</span>
                : <span>You must read and sign the site WHS pack (v{pack.version}) before starting work.</span>}
            </div>
            <button type="button" onClick={openRead} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white">
              {pack.signed ? "Read the pack again" : "Read & sign the pack →"}
            </button>
          </>
        ) : (
          <div>
            <div className="prose prose-sm max-w-none text-sm border border-hairline rounded-lg p-3 mb-3 max-h-[45vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: pack.html || "<p>No content.</p>" }} />
            {pack.signed && <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2 text-[11px] text-ink mb-3">You&apos;ve already signed this version. Signing again isn&apos;t needed unless the pack changes.</div>}
            <label className="flex items-start gap-2 text-sm mb-3">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5" />
              <span>I have read and understood this site WHS pack (all parts) and will follow the controls.</span>
            </label>
            <p className="text-xs font-semibold text-muted mb-1">Sign below</p>
            <canvas
              ref={canvasRef} width={300} height={140}
              className="touch-none w-full max-w-[320px] rounded-lg border-2 border-hairline bg-white mb-2"
              onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
            />
            <div className="flex gap-2">
              <button type="button" onClick={clearCanvas} className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold">Clear</button>
              <button type="button" onClick={sign} disabled={!ack || !hasInk || busy} className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-40">
                {busy ? "Signing…" : "Sign & confirm"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
