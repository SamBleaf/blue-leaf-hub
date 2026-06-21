import { useEffect, useState } from "react";
import { useClientPortal } from "./clientPortalContext.js";
import { portalGet } from "../../lib/clientPortalApi.js";
import { getSupabase } from "../../lib/supabaseClient.js";
import { Loading, ErrorBox, Empty, Card, PageTitle, fmtDate } from "./clientPortalUi.jsx";

const FOLDER_LABELS = {
  contract: "Contract",
  approved_plans: "Approved Plans",
  engineering: "Engineering",
  specifications: "Specifications",
  selections: "Selections",
  variations: "Variations",
  progress_claims: "Progress Claims",
  meeting_minutes: "Meeting Minutes",
  compliance: "Compliance",
  whs: "WHS",
  warranty_handover: "Warranty & Handover",
  manuals: "Manuals",
  certificates: "Certificates",
};
const FOLDER_ORDER = Object.keys(FOLDER_LABELS);

/** Authenticated download: handles both a JSON { signedUrl } and streamed bytes. */
async function downloadDoc(projectId, doc) {
  const sb = getSupabase();
  const { data: { session } = {} } = sb ? await sb.auth.getSession() : { data: {} };
  const token = session?.access_token;
  const res = await fetch(`/api/portal/app/${projectId}/documents/${doc.id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const ctype = res.headers.get("content-type") || "";
  if (ctype.includes("application/json")) {
    const body = await res.json();
    if (body?.signedUrl) { window.open(body.signedUrl, "_blank", "noopener"); return; }
    throw new Error(body?.error || "Could not open document.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function ClientDocuments() {
  const ctx = useClientPortal();
  const projectId = ctx?.projectId;
  const [state, setState] = useState({ loading: true, folders: {}, error: null });
  const [busy, setBusy] = useState(null);
  const [dlErr, setDlErr] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    portalGet(projectId, "documents").then(({ ok, data, error }) => {
      if (cancelled) return;
      setState({ loading: false, folders: data?.folders || {}, error: ok ? null : error });
    });
    return () => { cancelled = true; };
  }, [projectId]);

  async function handleDownload(doc) {
    setBusy(doc.id); setDlErr(null);
    try { await downloadDoc(projectId, doc); }
    catch (e) { setDlErr(e.message || "Download failed."); }
    finally { setBusy(null); }
  }

  if (state.loading) return <Loading label="Loading your documents…" />;
  if (state.error) return <ErrorBox error={state.error} />;

  const folderKeys = Object.keys(state.folders).sort((a, b) => FOLDER_ORDER.indexOf(a) - FOLDER_ORDER.indexOf(b));

  return (
    <div className="space-y-5">
      <PageTitle sub="Every contract, plan, variation and certificate — in one place.">Documents</PageTitle>

      {dlErr ? <ErrorBox error={dlErr} /> : null}

      {folderKeys.length === 0 ? (
        <Empty title="No documents yet" hint="Your building contract and key documents will appear here." />
      ) : (
        folderKeys.map((folder) => (
          <Card key={folder} title={FOLDER_LABELS[folder] || folder}>
            <ul className="divide-y divide-hairline">
              {state.folders[folder].map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {doc.signedAt ? `Signed ${fmtDate(doc.signedAt)}` : fmtDate(doc.createdAt)}
                      {doc.signatureRequired && !doc.signedAt ? " · Signature required" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === doc.id}
                    onClick={() => handleDownload(doc)}
                    className="-mr-1 inline-flex min-h-[40px] shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {busy === doc.id ? "Opening…" : "Download →"}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
