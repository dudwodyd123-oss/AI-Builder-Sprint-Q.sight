import fetch from "node-fetch";

/**
 * 모두싸인 조회 전용 클라이언트 (개인 계정).
 *
 * ⚠️ 이 파일은 문서를 만들거나 서명을 요청하지 않는다. 오직 "내가 참여한 문서"를
 * 조회하고 파일을 받아오기만 한다. 계약서 생성과 서명 요청 메일 발송은 전부
 * 기업용 서버가 기업 계정 키로 처리한다.
 *
 * 여기 쓰는 키는 기업용과 다른 개인 계정의 키다. 기부자 본인이 자기 계정으로
 * 자기가 서명한 문서만 보게 하려는 것이다.
 */

const BASE_URL = (process.env.MODUSIGN_BASE_URL || "https://api.modusign.co.kr").replace(/\/+$/, "");
const EMAIL = process.env.MODUSIGN_EMAIL;
const API_KEY = process.env.MODUSIGN_API_KEY;

export function isConfigured() {
  return Boolean(EMAIL && API_KEY);
}

function authHeader() {
  if (!isConfigured()) {
    const err = new Error(
      "개인 모두싸인 계정이 연결되지 않았습니다. server/.env에 MODUSIGN_EMAIL / MODUSIGN_API_KEY를 넣어주세요."
    );
    err.status = 503;
    err.code = "MODUSIGN_NOT_CONFIGURED";
    throw err;
  }
  return "Basic " + Buffer.from(`${EMAIL}:${API_KEY}`).toString("base64");
}

async function modusignFetch(path) {
  const auth = authHeader();
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json", Authorization: auth },
    });
  } catch (e) {
    const err = new Error("모두싸인에 연결할 수 없습니다.");
    err.status = 503;
    err.cause = e;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || data?.title || `모두싸인 API 오류 (${res.status})`);
    err.status = res.status === 401 ? 401 : res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** 내 계정으로 볼 수 있는 문서 목록 */
export async function listDocuments({ page = 1, perPage = 50 } = {}) {
  const data = await modusignFetch(`/documents?page=${page}&per_page=${perPage}`);
  return data.documents || [];
}

/**
 * 문서 상세. file.downloadUrl(만료되는 pre-signed URL)이 함께 온다.
 *
 * 문서 화면 한 번에 상세 조회가 두 번(메타데이터 + PDF용 downloadUrl) 나가는데
 * 모두싸인 rate limit이 빡빡해서 짧게 캐시한다. downloadUrl 유효시간(10분)보다
 * 훨씬 짧게 잡아 만료된 URL을 재사용하는 일이 없게 한다.
 */
const CACHE_TTL_MS = 30_000;
const detailCache = new Map(); // documentId -> { at, doc }

export async function getDocument(documentId) {
  const hit = detailCache.get(documentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.doc;

  const doc = await modusignFetch(`/documents/${encodeURIComponent(documentId)}`);
  detailCache.set(documentId, { at: Date.now(), doc });
  return doc;
}

/**
 * 문서 PDF 원본 바이트.
 *
 * downloadUrl은 10분이면 만료되는 pre-signed URL이라 브라우저에 그대로 넘기면
 * 화면을 열어둔 사이에 깨진다. 서버가 대신 받아서 흘려보내면 만료 걱정이 없고
 * API 키도 브라우저로 새어나가지 않는다.
 */
export async function downloadDocumentFile(documentId) {
  const doc = await getDocument(documentId);
  const url = doc?.file?.downloadUrl;
  if (!url) {
    const err = new Error("아직 내려받을 수 있는 문서 파일이 없습니다.");
    err.status = 404;
    throw err;
  }

  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error(`문서 파일을 받지 못했습니다 (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), title: doc.title };
}
