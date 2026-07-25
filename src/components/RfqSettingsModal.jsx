import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, apiPut } from "../lib/apiFetch.js";
import {
  DEFAULT_EMAIL_SIGNATURE,
  formatSignatureFooter,
  loadEmailSignature,
  persistSignatureLogoDataUrl,
  saveEmailSignature
} from "../lib/rfqSettings.js";

export default function RfqSettingsModal({ onClose, onApplied }) {
  const [sig, setSig] = useState(() => loadEmailSignature());
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [alsoDefault, setAlsoDefault] = useState(false); // admin: also set as the team default
  const initialRef = useRef(sig); // the value at mount, to detect in-progress edits

  useEffect(() => {
    setPreview(formatSignatureFooter(sig));
  }, [sig]);

  // Your PERSONAL signature is the source of truth for emails you send. On open, pull your saved one
  // (or the team default if you haven't set one) over the local cache — but ONLY if you haven't started
  // editing yet, so a slow GET can't clobber an in-flight edit. Keeps the locally-held logo.
  useEffect(() => {
    let stop = false;
    const norm = (o) => JSON.stringify({ ...o, logoDataUrl: "" });
    (async () => {
      const { ok, data } = await apiFetch("/api/settings/email-signature");
      if (stop || !ok) return;
      if (data?.isAdmin) setIsAdmin(true);
      if (!data?.signature) return;
      setSig((s) => (norm(s) === norm(initialRef.current)
        ? { ...DEFAULT_EMAIL_SIGNATURE, ...data.signature, logoDataUrl: s.logoDataUrl }
        : s));
    })();
    return () => { stop = true; };
  }, []);

  const handleLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/i.test(file.type)) {
      alert("Please upload a PNG or JPEG image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result;
      if (typeof base64 === "string") {
        persistSignatureLogoDataUrl(base64);
        setSig((s) => ({ ...s, logoDataUrl: base64 }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const save = async () => {
    setSaving(true);
    setSaveErr("");
    saveEmailSignature(sig); // local cache (offline + logo)
    // Persist YOUR OWN signature (per account); admins can also set it as the team default.
    const { fullName, title, mobile, website, postalAddress, legalDisclaimer } = sig;
    const { ok, error } = await apiPut("/api/settings/email-signature", {
      signature: { fullName, title, mobile, website, postalAddress, legalDisclaimer },
      alsoTeamDefault: isAdmin && alsoDefault
    });
    setSaving(false);
    if (!ok) { setSaveErr(error || "Saved on this device, but couldn't save to the server."); return; }
    onApplied?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-hairline bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-primary">Email signature</h2>
            <p className="mt-1 text-xs text-muted">
              Your personal signature — used on emails <b>you</b> send. Each account has its own. Full mail & Dropbox setup:{" "}
              <Link to="/tender-manager/settings" className="font-semibold text-accent underline" onClick={onClose}>
                Settings
              </Link>
              .
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-page">
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block text-xs font-semibold text-ink">
            Full name
            <input
              className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm"
              value={sig.fullName}
              onChange={(e) => setSig((s) => ({ ...s, fullName: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-semibold text-ink">
            Title
            <input
              className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm"
              value={sig.title}
              onChange={(e) => setSig((s) => ({ ...s, title: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-semibold text-ink">
            Mobile
            <input
              className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm"
              value={sig.mobile}
              onChange={(e) => setSig((s) => ({ ...s, mobile: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-semibold text-ink">
            Website URL
            <input
              className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm"
              value={sig.website}
              onChange={(e) => setSig((s) => ({ ...s, website: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-semibold text-ink">
            Postal address
            <input
              className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm"
              value={sig.postalAddress}
              onChange={(e) => setSig((s) => ({ ...s, postalAddress: e.target.value }))}
            />
          </label>
          <div>
            <span className="text-xs font-semibold text-ink">Logo (JPEG / PNG)</span>
            <p className="mt-0.5 text-[11px] text-muted">
              Plain-text email cannot embed images; we append a short line so recipients know branding is on file.
            </p>
            <input type="file" accept="image/png,image/jpeg" className="mt-2 text-xs" onChange={handleLogo} />
            {sig.logoDataUrl ? (
              <img
                src={sig.logoDataUrl}
                alt="Signature logo preview"
                className="mt-2 max-w-[120px] rounded border border-hairline"
              />
            ) : null}
            {sig.logoDataUrl ? (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-danger"
                onClick={() => {
                  persistSignatureLogoDataUrl("");
                  setSig((s) => ({ ...s, logoDataUrl: "" }));
                }}
              >
                Remove logo
              </button>
            ) : null}
          </div>
          <label className="block text-xs font-semibold text-ink">
            Legal disclaimer
            <textarea
              rows={5}
              className="mt-1 w-full rounded-lg border border-hairline bg-page px-3 py-2 text-xs leading-relaxed"
              value={sig.legalDisclaimer}
              onChange={(e) => setSig((s) => ({ ...s, legalDisclaimer: e.target.value }))}
            />
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-hairline bg-page p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Preview</div>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted">{preview}</pre>
        </div>

        {isAdmin ? (
          <label className="mt-4 flex items-start gap-2 text-xs text-ink">
            <input type="checkbox" className="mt-0.5" checked={alsoDefault} onChange={(e) => setAlsoDefault(e.target.checked)} />
            <span>Also set as the <b>team default</b> — used for staff who haven&apos;t set up their own signature yet.</span>
          </label>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              persistSignatureLogoDataUrl("");
              setSig({ ...DEFAULT_EMAIL_SIGNATURE });
            }}
            className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold"
          >
            Reset defaults
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={save} className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {saveErr ? <p className="mt-2 text-xs text-danger">{saveErr}</p> : null}
      </div>
    </div>
  );
}
