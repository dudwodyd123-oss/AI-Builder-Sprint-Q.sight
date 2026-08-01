import fetch from "node-fetch";

/**
 * 기업용 웹 서버 API 클라이언트.
 *
 * 개인용 웹은 모두싸인을 직접 호출하지 않는다. 계약서 생성과 서명 요청 메일 발송은
 * 전부 기업용 서버가 담당하고, 개인용 *서버*가 이 파일을 통해서만 그쪽을 호출한다.
 * (브라우저에서 직접 부르지 않으므로 기업용 API를 인터넷에 노출할 필요가 없다)
 */

const BASE_URL = (process.env.QSIGHT_CORP_API || "http://localhost:8080").replace(/\/+$/, "");

export { BASE_URL as CORP_BASE_URL };

async function corpFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    const err = new Error(
      `기업용 서버(${BASE_URL})에 연결할 수 없습니다. 서버가 실행 중인지, QSIGHT_CORP_API 값이 맞는지 확인해주세요.`
    );
    err.status = 503;
    err.cause = e;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.detail || data?.message || `기업용 API 오류 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** ① 모금 사업 목록 */
export function listPrograms() {
  return corpFetch("/api/public/programs");
}

/**
 * ② 계약 항목 스키마 (챗봇의 질문지)
 *
 * 기부 유형마다 서식이 다르다. 유산기부는 기관이 따로 등록한 유산 서식을 쓰므로
 * 정기기부용 항목(회차 금액·납부 주기·약정 기간)을 묻지 않는다.
 */
export function getContractForm(programId, donationType = "default") {
  const query = donationType && donationType !== "default" ? `?donation_type=${encodeURIComponent(donationType)}` : "";
  return corpFetch(`/api/public/programs/${encodeURIComponent(programId)}/contract-form${query}`);
}

/**
 * 이 사업을 지금도 새로 선택할 수 있는가.
 *
 * 기업용에서 사업을 "보관"하면 ①의 목록에서 빠진다. ②는 보관 여부와 무관하게
 * 서식을 계속 돌려주기 때문에, 대화 도중에 보관된 경우를 잡으려면 ① 목록에
 * 아직 남아 있는지 따로 확인해야 한다.
 */
export async function isProgramLive(programId) {
  const data = await listPrograms();
  return (data.rows || []).some((p) => p.id === programId);
}

/** ②를 가져오되, 보관된 사업이면 거부한다. */
export async function getLiveContractForm(programId, donationType = "default") {
  const [live, form] = await Promise.all([
    isProgramLive(programId),
    getContractForm(programId, donationType),
  ]);
  if (!live) {
    const err = new Error("이 사업은 모금이 종료되어 더 이상 약정을 진행할 수 없습니다.");
    err.status = 409;
    err.code = "PROGRAM_ARCHIVED";
    throw err;
  }
  return form;
}

/** ③ 약정 생성 — 실제로 기부자에게 서명 요청 메일이 발송된다 */
export function createAgreement({ programId, values, signer, donationType = "default" }) {
  return corpFetch("/api/public/agreements", {
    method: "POST",
    body: JSON.stringify({
      program_id: programId,
      values,
      signer,
      donation_type: donationType,
    }),
  });
}

/** ④ 서명 상태 조회 */
export function getAgreement(agreementId) {
  return corpFetch(`/api/public/agreements/${encodeURIComponent(agreementId)}`);
}
