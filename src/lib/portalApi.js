async function portalFetch(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw { status: res.status, message: err.error || "Request failed" };
  }
  return res.json();
}

export const verifyPortal = (token) => portalFetch(`/api/portal/${token}`);
export const getPortalHome = (token) => portalFetch(`/api/portal/${token}/home`);
export const getPortalTimeline = (token) => portalFetch(`/api/portal/${token}/timeline`);
export const getPortalLiveSite = (token) => portalFetch(`/api/portal/${token}/livesite`);
export const getPortalDecisions = (token) => portalFetch(`/api/portal/${token}/decisions`);
export const getPortalBudget = (token) => portalFetch(`/api/portal/${token}/budget`);
export const getPortalJournal = (token) => portalFetch(`/api/portal/${token}/journal`);
export const getPortalDocuments = (token) => portalFetch(`/api/portal/${token}/documents`);
export const getPortalMyHome = (token) => portalFetch(`/api/portal/${token}/myhome`);
export const getPortalConversations = (token) => portalFetch(`/api/portal/${token}/conversations`);
export const getWarrantyItems = (token) => portalFetch(`/api/portal/${token}/warranty`);

export const sendPortalMessage = (token, body) =>
  portalFetch(`/api/portal/${token}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });

export const bookSiteWalk = (token, siteWalkId) =>
  portalFetch(`/api/portal/${token}/sitewalk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteWalkId })
  });

export const respondToDecision = (token, decisionId, payload) =>
  portalFetch(`/api/portal/${token}/decisions/${decisionId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const submitWarrantyItem = (token, payload) =>
  portalFetch(`/api/portal/${token}/warranty`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const generatePortalToken = (projectId) =>
  portalFetch("/api/portal/admin/generate-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId })
  });

export const enableTestPortal = (projectId) =>
  portalFetch(`/api/portal/admin/enable-test/${projectId}`, { method: "POST" });

export const seedTestData = (projectId) =>
  portalFetch("/api/portal/admin/seed-test-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId })
  });

export const savePortalUpdate = (payload) =>
  portalFetch("/api/portal/admin/updates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const patchPortalUpdate = (updateId, payload) =>
  portalFetch(`/api/portal/admin/updates/${updateId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const uploadPortalPhoto = async (projectId, file, meta = {}) => {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const contentBase64 = btoa(binary);
  return portalFetch("/api/portal/admin/photos/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      fileName: file.name,
      contentBase64,
      ...meta
    })
  });
};

export const upsertMilestone = (payload) =>
  portalFetch("/api/portal/admin/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const saveDecision = (payload) =>
  portalFetch("/api/portal/admin/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const saveClaim = (payload) =>
  portalFetch("/api/portal/admin/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const getAdminSummary = (projectId) => portalFetch(`/api/portal/admin/${projectId}/summary`);

export const addSiteWalk = (payload) =>
  portalFetch("/api/portal/admin/site-walks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const saveFinish = (payload) =>
  portalFetch("/api/portal/admin/finishes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const saveWarrantyPeriod = (payload) =>
  portalFetch("/api/portal/admin/warranty-periods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

export const sendBuilderMessage = (payload) =>
  portalFetch("/api/portal/admin/builder-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
