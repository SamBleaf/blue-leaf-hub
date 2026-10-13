// =============================================================================
// CalibrationScreen — two-axis plan scale (R03 §4). The owner calls it longitude/latitude;
// the UI says Horizontal and Vertical.
//   1 (optional) draw a region + name it        → otherwise the whole page
//   2 Horizontal: tap two points on a long printed dimension, type its mm
//   3 Vertical: same on a vertical dimension
//   4 Agreement: ≤0.5% → one uniform scale (mean). Above → re-tap, or explicitly choose
//     "Drawing stretched: use separate X/Y scales". Never a silent stretch.
//   5 Check: a third printed dimension. ≤0.5% → Ready; above → saved as Needs review
//     (viewable, but measured results are blocked from ordering until re-scaled).
// The second point of each axis is locked to the first point's other coordinate (as seen on
// screen). The server recomputes every scale from these points — the preview is advisory.
// =============================================================================
import { useMemo, useRef, useState } from "react";
import { buildCalibration, verifyCalibration, verificationReusesReference, totalRotation, lockSecondaryAxis as lockAxis, CALIBRATION_STATUS, DEFAULT_TOLERANCE } from "../../../shared/takeoff/index.js";
import { newId } from "../../lib/takeoffApi.js";
import PdfViewport from "./PdfViewport.jsx";
import { PointHandlesLayer } from "./PointHandles.jsx";
import { Banner, Btn, FocusedWindow, NumberField, Sheet, TextField } from "./ui.jsx";
import { fmtMm } from "./format.js";

const MIN_TAP_SEPARATION_PX = 20;


export default function CalibrationScreen({ doc, documentId, pageIndex, displayRotation: initialRotation = 0, existing = [], onSave, onClose, docTitle }) {
  const vpRef = useRef(null);
  const [displayRotation, setDisplayRotation] = useState(initialRotation);
  const [meta, setMeta] = useState(null);
  const [step, setStep] = useState("start"); // start | r1 | r2 | rname | h | v | agree | check | review
  const [region, setRegion] = useState(null);
  const [regionLabel, setRegionLabel] = useState("");
  const [pts, setPts] = useState({ h: [], v: [], c: [], r: [] });
  const [mm, setMm] = useState({ h: null, v: null, c: null });
  const [mode, setMode] = useState(null);
  const [msg, setMsg] = useState(null);
  const [selected, setSelected] = useState(null);

  const rot = meta ? totalRotation(meta, displayRotation) : 0;
  const axisOf = { h: "horizontal", v: "vertical" };

  const built = useMemo(() => {
    if (pts.h.length < 2 || pts.v.length < 2 || !mm.h || !mm.v) return null;
    try {
      return buildCalibration({ basisRotation: rot, horizontal: { p1: pts.h[0], p2: pts.h[1], knownMm: mm.h }, vertical: { p1: pts.v[0], p2: pts.v[1], knownMm: mm.v }, mode: mode || undefined, region });
    } catch (e) { return { ok: false, message: e.message }; }
  }, [pts, mm, rot, mode, region]);
  const verified = useMemo(() => {
    if (!built?.ok || pts.c.length < 2 || !mm.c) return null;
    if (verificationReusesReference(built.calibration, { p1: pts.c[0], p2: pts.c[1] })) return { reused: true };
    try { return verifyCalibration(built.calibration, { p1: pts.c[0], p2: pts.c[1], expectedMm: mm.c }); } catch { return null; }
  }, [built, pts.c, mm.c]);

  function onTap(p, screen) {
    setMsg(null);
    if (region && step !== "r1" && step !== "r2" && (p.x < region.x0 || p.x > region.x1 || p.y < region.y0 || p.y > region.y1)) {
      setMsg("That point is outside the region you are scaling."); return;
    }
    const add = (key, q) => setPts((s) => ({ ...s, [key]: [...s[key], q] }));
    if (step === "r1") { add("r", p); setStep("r2"); return; }
    if (step === "r2") {
      const a = pts.r[0];
      setRegion({ x0: Math.min(a.x, p.x), y0: Math.min(a.y, p.y), x1: Math.max(a.x, p.x), y1: Math.max(a.y, p.y) });
      setPts((s) => ({ ...s, r: [a, p] })); setStep("rname"); return;
    }
    const key = step === "h" ? "h" : step === "v" ? "v" : step === "check" ? "c" : null;
    if (!key) return;
    const cur = pts[key];
    if (cur.length >= 2) return;
    let q = p;
    if (cur.length === 1 && (key === "h" || key === "v")) q = lockAxis(axisOf[key], cur[0], p, rot);
    if (cur.length === 1) {
      const s0 = vpRef.current.toScreen(cur[0]), s1 = vpRef.current.toScreen(q);
      if (Math.hypot(s1.x - s0.x, s1.y - s0.y) < MIN_TAP_SEPARATION_PX) { setMsg("Those two points are too close on screen — zoom in for accuracy, or use a longer dimension."); return; }
    }
    void screen;
    add(key, q);
  }

  function constrain(id, p) {
    const [key, idx] = id.split(":");
    if ((key === "h" || key === "v") && idx === "1") return lockAxis(axisOf[key], pts[key][0], p, rot);
    return p;
  }
  function movePoint(id, p) {
    const [key, idx] = id.split(":");
    setPts((s) => {
      const arr = s[key].slice(); arr[Number(idx)] = p;
      // moving the first point of an axis re-locks the second
      if ((key === "h" || key === "v") && idx === "0" && arr[1]) arr[1] = lockAxis(axisOf[key], p, arr[1], rot);
      return { ...s, [key]: arr };
    });
  }

  function save() {
    const cal = (verified && !verified.reused ? verified : null) || built?.calibration;
    if (!cal) return;
    const id = newId();
    // A re-scale of the SAME page region supersedes that region's newest saved scale (never another region's).
    const label = region ? regionLabel.trim() : null;
    const prev = existing.filter((c) => !c.pending && (c.regionLabel || null) === label).sort((a, b) => (b.calibrationRevision || 0) - (a.calibrationRevision || 0))[0];
    const supersedes = prev?.id || null;
    onSave({
      id, documentId, pageIndex, pageMeta: meta, region, regionLabel: region ? regionLabel.trim() : null, supersedesCalibrationId: supersedes || null,
      basisRotation: rot, mode: cal.mode, horizontal: cal.horizontal, vertical: cal.vertical,
      verification: verified && !verified.reused ? { p1: pts.c[0], p2: pts.c[1], expectedMm: mm.c } : null,
      preview: { ...cal, id, documentId, pageIndex, region, regionLabel: region ? regionLabel.trim() : null, pageMeta: meta },
    }, displayRotation);
  }

  const handles = [
    ...pts.h.map((p, i) => ({ id: `h:${i}`, p, color: "#006c9b", label: `Horizontal point ${i + 1}` })),
    ...pts.v.map((p, i) => ({ id: `v:${i}`, p, color: "#7c3aed", label: `Vertical point ${i + 1}` })),
    ...pts.c.map((p, i) => ({ id: `c:${i}`, p, color: "#16a34a", label: `Check point ${i + 1}` })),
  ];
  const tapping = ["r1", "r2", "h", "v", "check"].includes(step);

  return (
    <FocusedWindow title="Scale this page" subtitle={`${docTitle || "Plan"} · page ${pageIndex + 1}${region && regionLabel ? ` · ${regionLabel}` : ""}`} onClose={onClose} closeLabel="Cancel"
      actions={<Btn kind="ghost" onClick={() => setDisplayRotation((r) => (r + 90) % 360)} aria-label="Rotate view 90 degrees" disabled={pts.h.length + pts.v.length > 0}>⟳ 90°</Btn>}>
      <PdfViewport
        ref={vpRef} doc={doc} pageIndex={pageIndex} displayRotation={displayRotation} mode={tapping ? "tap" : "pan"} className="min-h-0 flex-1"
        ariaLabel="Plan page — tap to place calibration points"
        onTap={tapping ? onTap : undefined}
        onPageMeta={setMeta}
        overlay={({ toScreen, size }) => {
          const line = (arr, color, dash) => arr.length === 2 && (() => { const a = toScreen(arr[0]), b = toScreen(arr[1]); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={2.5} strokeDasharray={dash} />; })();
          const guide = (arr, axis) => {
            if (arr.length !== 1) return null;
            const a = toScreen(arr[0]);
            return axis === "horizontal" ? <line x1={0} y1={a.y} x2={size.w} y2={a.y} stroke="#006c9b" strokeOpacity={0.35} strokeDasharray="6 6" /> : <line x1={a.x} y1={0} x2={a.x} y2={size.h} stroke="#7c3aed" strokeOpacity={0.35} strokeDasharray="6 6" />;
          };
          let rect = null;
          if (region) { const a = toScreen({ x: region.x0, y: region.y0 }), b = toScreen({ x: region.x1, y: region.y1 }); rect = <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="#006c9b" fillOpacity={0.06} stroke="#006c9b" strokeDasharray="4 4" />; }
          return (
            <>
              {rect}
              {step === "h" && guide(pts.h, "horizontal")}
              {step === "v" && guide(pts.v, "vertical")}
              {line(pts.h, "#006c9b")}{line(pts.v, "#7c3aed")}{line(pts.c, "#16a34a", "5 4")}
              <PointHandlesLayer points={handles} toScreen={toScreen} viewportRef={vpRef} selectedId={selected} onSelect={setSelected}
                constrain={constrain} onMove={movePoint} onCommit={movePoint} />
            </>
          );
        }}
      />
      <Sheet title={STEP_TITLES[step]} initialFocus={false}>
        {msg && <div className="mb-2"><Banner tone="warn">{msg}</Banner></div>}
        {step === "start" && (
          <div className="space-y-2">
            <p className="text-sm text-muted">Pick a long horizontal dimension and a long vertical dimension printed on this page. Zoom in before tapping each end.</p>
            <Btn kind="primary" className="w-full" onClick={() => setStep("h")}>Scale the whole page</Btn>
            <Btn className="w-full" onClick={() => setStep("r1")}>Scale a region only (e.g. one floor plan on a sheet)</Btn>
          </div>
        )}
        {(step === "r1" || step === "r2") && <p className="text-sm text-muted">Tap {step === "r1" ? "one corner" : "the opposite corner"} of the region.</p>}
        {step === "rname" && (
          <div className="space-y-2">
            <TextField label="Region name" value={regionLabel} onChange={setRegionLabel} placeholder="e.g. Ground floor plan" autoFocus />
            <div className="flex gap-2"><Btn onClick={() => { setRegion(null); setPts((s) => ({ ...s, r: [] })); setStep("r1"); }}>Redraw</Btn>
              <Btn kind="primary" className="flex-1" disabled={!regionLabel.trim()} onClick={() => setStep("h")}>Next: horizontal</Btn></div>
          </div>
        )}
        {(step === "h" || step === "v") && (
          <AxisStep axis={axisOf[step]} pts={pts[step]} value={mm[step]}
            onValue={(n) => setMm((m) => ({ ...m, [step]: n }))}
            onRetap={() => { setPts((s) => ({ ...s, [step]: [] })); setMm((m) => ({ ...m, [step]: null })); }}
            onNext={() => setStep(step === "h" ? "v" : "agree")} />
        )}
        {step === "agree" && built && (
          <div className="space-y-2 text-sm">
            {built.ok === false && built.reason !== "axis_mismatch" && <Banner tone="error">{built.message}</Banner>}
            <p>Horizontal <b>{fmtMm(mm.h)} mm</b> · Vertical <b>{fmtMm(mm.v)} mm</b></p>
            <p className="text-muted">Difference between the two scales: <b className="text-ink">{((built.discrepancy ?? built.calibration?.discrepancy ?? 0) * 100).toFixed(2)}%</b> (limit {(DEFAULT_TOLERANCE * 100).toFixed(1)}%)</p>
            {built.ok ? (
              <>
                <p>{built.calibration.mode === "separate" ? "Using separate horizontal and vertical scales." : "Both directions agree — one scale will be used."}</p>
                <Btn kind="primary" className="w-full" onClick={() => setStep("check")}>Next: check a third dimension</Btn>
              </>
            ) : built.reason === "axis_mismatch" ? (
              <>
                <Banner tone="warn">The horizontal and vertical scales don&apos;t agree. Re-tap the points, or if this drawing really is stretched, use separate scales.</Banner>
                <div className="flex flex-col gap-2">
                  <Btn onClick={() => { setPts((s) => ({ ...s, h: [], v: [] })); setStep("h"); }}>Re-tap both</Btn>
                  <Btn kind="danger" onClick={() => setMode("separate")}>Drawing stretched: use separate X/Y scales</Btn>
                </div>
              </>
            ) : null}
          </div>
        )}
        {step === "check" && (
          <div className="space-y-2 text-sm">
            <p className="text-muted">Tap both ends of a <b>different</b> printed dimension, then type it. This independently checks the scale.</p>
            {pts.c.length === 2 && <NumberField label="Printed check dimension" value={mm.c} onCommit={(n) => setMm((m) => ({ ...m, c: n }))} autoFocus />}
            {verified?.reused && <Banner tone="warn">That&apos;s the same dimension you scaled with — pick a different printed dimension so the check is independent.</Banner>}
            {verified && !verified.reused && (
              <Banner tone={verified.status === CALIBRATION_STATUS.READY ? "ok" : "warn"}>
                Expected {fmtMm(verified.verification.expectedMm)} mm · measured {fmtMm(verified.verification.observedMm)} mm · error {(verified.verification.error * 100).toFixed(2)}%.
                {verified.status === CALIBRATION_STATUS.READY ? " Scale is ready." : " This is outside 0.5% — the page will be marked Needs review and measured runs can't be ordered until it is re-scaled."}
              </Banner>
            )}
            <div className="flex gap-2">
              {pts.c.length > 0 && <Btn onClick={() => { setPts((s) => ({ ...s, c: [] })); setMm((m) => ({ ...m, c: null })); }}>Re-tap</Btn>}
              <Btn kind="primary" className="flex-1" disabled={!verified || verified.reused} onClick={save}>Save scale</Btn>
            </div>
            <Btn kind="ghost" className="w-full" onClick={save} disabled={!built?.ok}>Save without a check (Not checked — can&apos;t order measured runs)</Btn>
            <p className="text-[11px] text-muted">The check confirms your taps and typed numbers — it doesn&apos;t prove the drawing itself is dimensionally accurate.</p>
          </div>
        )}
      </Sheet>
    </FocusedWindow>
  );
}

const STEP_TITLES = {
  start: "Set the scale", r1: "Region — first corner", r2: "Region — opposite corner", rname: "Name the region",
  h: "Horizontal dimension", v: "Vertical dimension", agree: "Compare directions", check: "Independent check", review: "Review",
};

function AxisStep({ axis, pts, value, onValue, onRetap, onNext }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        {pts.length === 0 && `Tap one end of a long ${axis} dimension.`}
        {pts.length === 1 && `Tap the other end — it stays exactly ${axis} on screen.`}
        {pts.length === 2 && "Type the dimension printed on the plan."}
      </p>
      {pts.length === 2 && <NumberField label={`${axis === "horizontal" ? "Horizontal" : "Vertical"} dimension`} value={value} onCommit={onValue} autoFocus />}
      <div className="flex gap-2">
        {pts.length > 0 && <Btn onClick={onRetap}>Re-tap</Btn>}
        <Btn kind="primary" className="flex-1" disabled={pts.length < 2 || !value} onClick={onNext}>Next</Btn>
      </div>
      <p className="text-[11px] text-muted">Drag a point to adjust it — a magnifier shows exactly where it sits. On a keyboard: select a point, then Alt + arrow keys.</p>
    </div>
  );
}
