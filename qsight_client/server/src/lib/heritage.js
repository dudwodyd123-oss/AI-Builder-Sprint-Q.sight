import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";

/**
 * 문화유산 실시간 정보 연동 (공공데이터포털 data.go.kr / 국가유산청 레거시 Open API).
 *
 * 국가유산청이 공개한 문화유산 Open API를 그대로 중계한다. 실제로 확인된 두 계열을 모두 지원한다:
 *
 *   1) 국가유산청 레거시 무료 API (예: http://www.cha.go.kr/cha/SearchKindOpenapiList.do,
 *      SearchLctoOpenapi.do 등) — 서비스키가 필요 없고 응답이 XML 전용이다.
 *      <result><msg>성공</msg><item>...</item>...</result> 형태로 온다.
 *      (2026-08-02, 사용자가 SearchLctoOpenapi.do?ccbaCtcd=11 로 직접 호출해 정상 응답을 확인함)
 *   2) data.go.kr에 등록된 일반 Open API (서비스키 필요) — 보통
 *      <response><body><items><item>...</item></items></body></response> 형태의 XML 또는
 *      _type=json 파라미터를 지원하면 JSON으로도 응답한다.
 *
 * ⚠️ 데이터셋마다 정확한 요청 URL·파라미터·응답 필드명이 다르고 포털 개편으로 종종 바뀐다.
 *    그래서 요청 URL 전체(HERITAGE_API_URL)를 .env에서 그대로 받아 쓰도록 만들었다 —
 *    사용자가 데이터셋 상세페이지의 "미리보기/샘플 URL"을 그대로 복사해 넣으면 코드 수정 없이 바로 붙는다.
 *    응답이 JSON이면 JSON으로, 아니면 XML로 자동 파싱한다.
 *
 * 키가 없거나 호출이 실패해도 화면이 죽지 않도록, 실패 시 정적 목록으로
 * 조용히 폴백한다 (upstage/modusign과 동일한 "부분 기능 저하" 원칙).
 */

const SERVICE_KEY = process.env.HERITAGE_SERVICE_KEY || "";
const API_URL = process.env.HERITAGE_API_URL || "";
const CACHE_MS = 10 * 60 * 1000; // 10분 — 문화유산 지정 현황은 자주 바뀌는 데이터가 아니다

// parseTagValue: false — ccbaAsno(관리번호) 등이 "00010000"처럼 0으로 시작하는 코드값이라
// 자동 숫자 변환(선행 0 소실)을 막기 위해 태그 값을 항상 문자열 그대로 둔다.
const xmlParser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false });

let cache = { at: 0, items: null };

/** HERITAGE_API_URL만 있으면 동작한다 — 레거시 국가유산청 API는 서비스키가 필요 없다. */
export function isConfigured() {
  return Boolean(API_URL);
}

/** 응답(JSON 또는 XML 파싱 결과)에서 아이템 배열을 찾는다. 데이터셋마다 래핑 구조가 다르다. */
function extractItems(json) {
  const body = json?.response?.body ?? json?.body ?? json?.result ?? json;
  const items = body?.items?.item ?? body?.items ?? body?.item ?? [];
  return Array.isArray(items) ? items : items ? [items] : [];
}

/** 흔히 쓰이는 필드명 후보들을 순서대로 시도해 사람이 읽을 수 있는 형태로 정규화한다. */
function normalizeItem(raw, idx) {
  const pick = (...keys) => keys.map((k) => raw?.[k]).find((v) => v !== undefined && v !== null && v !== "");
  const name = pick("ccbaMnm1", "ccbaMnm", "name", "title", "culturalHeritageName") || `문화유산 ${idx + 1}`;
  const category = pick("ccbaKdcdNm", "ccmaName", "ccbaKdcd", "category", "kind");
  const region = pick("ccbaCtcdNm", "ccbaLcad", "region", "address", "location");
  const era = pick("ccceName", "era", "period");
  // 국가유산청 문화재 공간 정보(data.go.kr 3070426) 등 사진이 포함된 데이터셋을 쓰는 경우를
  // 대비한 필드다. 레거시 국가유산청 API(SearchLctoOpenapi 등)는 사진을 주지 않으므로 대개
  // undefined이고, 그 경우 화면은 직접 그린 일러스트 플레이스홀더로 대체해 보여준다.
  const image = pick("imageUrl", "imgUrl", "photoUrl", "image", "ccimgUrl", "thumbnail");
  return {
    id: pick("ccbaAsno", "id") || `heritage-${idx}`,
    name: String(name),
    category: category ? String(category) : undefined,
    region: region ? String(region) : undefined,
    era: era ? String(era) : undefined,
    image: image ? String(image) : undefined,
  };
}

async function fetchLive() {
  const url = new URL(API_URL);
  // 서비스키가 필요한 데이터셋(data.go.kr 등록형)만 해당 — 레거시 국가유산청 API는 무시해도 무해하다.
  if (SERVICE_KEY && !url.searchParams.has("serviceKey")) url.searchParams.set("serviceKey", SERVICE_KEY);
  if (!url.searchParams.has("numOfRows") && !url.searchParams.has("pageUnit")) url.searchParams.set("numOfRows", "20");
  if (!url.searchParams.has("pageNo") && !url.searchParams.has("pageIndex")) url.searchParams.set("pageNo", "1");

  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`문화유산 Open API 오류 (${res.status})`);
    err.status = res.status;
    throw err;
  }

  // 데이터셋에 따라 JSON 또는 XML로 응답한다. JSON으로 먼저 시도하고, 실패하면 XML로 파싱한다
  // (국가유산청 레거시 API는 XML 전용 응답만 내려준다).
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    try {
      json = xmlParser.parse(text);
    } catch {
      const err = new Error("문화유산 Open API 응답을 해석할 수 없습니다 (JSON/XML 모두 파싱 실패).");
      err.status = 502;
      throw err;
    }
  }

  const errMsg = json?.result?.msg || json?.response?.header?.resultMsg;
  if (errMsg && errMsg !== "성공" && errMsg !== "OK" && !/^(NORMAL SERVICE|success)/i.test(String(errMsg))) {
    const err = new Error(`문화유산 Open API 오류 응답: ${errMsg}`);
    err.status = 502;
    throw err;
  }

  return extractItems(json).map(normalizeItem);
}

/**
 * 문화유산 목록을 가져온다. 연동이 안 돼 있거나 실패하면 null을 돌려주고,
 * 호출부(routes/heritage.js)가 정적 목록으로 폴백한다.
 */
export async function getHeritageList() {
  if (!isConfigured()) return null;

  const now = Date.now();
  if (cache.items && now - cache.at < CACHE_MS) return cache.items;

  const items = await fetchLive();
  cache = { at: now, items };
  return items;
}
