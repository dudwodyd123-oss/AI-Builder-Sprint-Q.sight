const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `요청 실패 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // 챗봇
  chat: (type, messages) =>
    request("/chat", { method: "POST", body: JSON.stringify({ type, messages }) }),

  // 약속(pledge)
  createPledge: (payload) => request("/pledges", { method: "POST", body: JSON.stringify(payload) }),
  getPledge: (id) => request(`/pledges/${id}`),
  updatePledge: (id, patch) => request(`/pledges/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  listPledges: () => request("/pledges"),

  // 약정서 문서
  generateDocument: (pledgeId) => request(`/pledges/${pledgeId}/document`, { method: "POST", body: "{}" }),
  previewDocument: (pledgeId, overrides = {}) =>
    request(`/pledges/${pledgeId}/document/preview`, { method: "POST", body: JSON.stringify(overrides) }),
  listDocuments: () => request("/documents"),
  getDocument: (id) => request(`/documents/${id}`),
  signDocument: (id, { signerName, signerEmail }) =>
    request(`/documents/${id}/sign`, { method: "POST", body: JSON.stringify({ signerName, signerEmail }) }),
  getDocumentStatus: (id) => request(`/documents/${id}/status`),
};
