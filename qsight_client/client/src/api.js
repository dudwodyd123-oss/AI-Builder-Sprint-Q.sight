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
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // ① 모금 사업 목록
  listPrograms: () => request("/programs"),

  // ② 계약 항목 스키마 (챗봇의 질문지)
  // 기부 유형마다 기관 서식이 다르다 ("legacy" → 유산기부 신청서)
  getContractForm: (programId, donationType = "default") =>
    request(`/programs/${programId}/contract-form?donationType=${encodeURIComponent(donationType)}`),

  // 챗봇 (Upstage) - 스키마를 체크리스트로 삼아 항목을 수집
  chat: ({ programId, messages, values }) =>
    request("/chat", { method: "POST", body: JSON.stringify({ programId, messages, values }) }),

  // ③ 약정 생성 - 기부자에게 서명 요청 메일이 실제로 발송된다
  createAgreement: ({ programId, values, signer, schemaVersion, fields, donationType = "default" }) =>
    request("/agreements", {
      method: "POST",
      body: JSON.stringify({ programId, values, signer, schemaVersion, fields, donationType }),
    }),

  // ④ 서명 상태 조회 (폴링 간격 10초 이상)
  getAgreement: (agreementId) => request(`/agreements/${agreementId}`),

  // 내 모두싸인 계정으로 조회하는 서명 문서 (조회 전용)
  listDocuments: () => request("/documents"),
  getDocument: (documentId) => request(`/documents/${documentId}`),
  documentFileUrl: (documentId) => `/api/documents/${documentId}/file`,

  // ---------- 유산기부 (녹음유언) ----------
  // 대본·질문·고지 문구는 전부 서버의 legacy-spec.json에서 온다. 화면에 하드코딩하지 않는다.
  getLegacySpec: () => request("/legacy/spec"),

  legacyChat: ({ programId, messages, values }) =>
    request("/legacy/chat", {
      method: "POST",
      body: JSON.stringify({ programId, messages, values }),
    }),

  createLegacyPledge: ({ programId, programName, consent, values }) =>
    request("/legacy/pledges", {
      method: "POST",
      body: JSON.stringify({ programId, programName, consent, values }),
    }),

  getLegacyPledge: (id) => request(`/legacy/pledges/${id}`),

  // 녹음만 다시 한다 (기부 의사 등록은 그대로 물려받아 서명을 다시 요청하지 않는다)
  redoLegacyPledge: (id) => request(`/legacy/pledges/${id}/redo`, { method: "POST" }),

  updateLegacyPledge: (id, patch) =>
    request(`/legacy/pledges/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  lookupLegacyPledges: (ids) =>
    request("/legacy/pledges/lookup", { method: "POST", body: JSON.stringify({ ids }) }),

  // 녹음은 MediaRecorder가 만든 Blob을 그대로 올린다 (파일 선택 input을 두지 않기 위해)
  uploadLegacyRecording: async (id, blob, durationMs) => {
    const res = await fetch(`${BASE}/legacy/pledges/${id}/recording`, {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "audio/webm",
        ...(durationMs ? { "X-Duration-Ms": String(Math.round(durationMs)) } : {}),
      },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `녹음 저장 실패 (${res.status})`);
      err.code = data.code;
      throw err;
    }
    return data;
  },

  legacyRecordingUrl: (id) => `/api/legacy/pledges/${id}/recording`,
};
