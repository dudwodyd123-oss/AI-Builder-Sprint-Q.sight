import fetch from "node-fetch";

const BASE_URL = process.env.MODUSIGN_BASE_URL || "https://api.modusign.co.kr";

function authHeader() {
  const email = process.env.MODUSIGN_EMAIL;
  const apiKey = process.env.MODUSIGN_API_KEY;
  if (!email || !apiKey) {
    throw new Error("MODUSIGN_EMAIL / MODUSIGN_API_KEY가 설정되지 않았습니다. server/.env를 확인하세요.");
  }
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * 모두싸인 서명 요청 (템플릿 없이 직접 생성한 PDF로 요청)
 * POST https://api.modusign.co.kr/documents
 * 문서: https://developers.modusign.co.kr/reference/documentcontroller_create
 */
export async function requestSigning({ title, pdfBase64, signerName, signerEmail, anchorText = "(서명)" }) {
  const body = {
    title,
    file: {
      base64: pdfBase64,
      extension: "pdf",
    },
    participants: [
      {
        name: signerName,
        signingOrder: 1,
        signingMethod: {
          type: "EMAIL",
          value: signerEmail,
        },
        fields: [
          {
            type: "SIGNATURE",
            required: true,
            signatureTypes: ["SIGN", "STAMP"],
            position: {
              anchor: {
                text: anchorText,
                offset: { x: 0.02, y: 0 },
              },
            },
            size: { width: 0.18, height: 0.06 },
          },
        ],
      },
    ],
  };

  const res = await fetch(`${BASE_URL}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || data?.detail || `ModuSign API 오류 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** 문서 상태 조회: GET /documents/{documentId} */
export async function getDocumentStatus(documentId) {
  const res = await fetch(`${BASE_URL}/documents/${documentId}`, {
    headers: {
      Accept: "application/json",
      Authorization: authHeader(),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || `ModuSign 상태 조회 오류 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
