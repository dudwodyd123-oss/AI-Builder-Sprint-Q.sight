import fetch from "node-fetch";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 고향사랑기부 답례품 실시간 연동.
 *
 * ⚠️ 고향사랑e음(고향사랑기부제 공식 포털)이나 부산 지역 포털인 busanlove.kr는
 *    둘 다 별도의 공개 Open API를 제공하지 않는다 (busanlove.kr는 화면을 JS로
 *    그려주는 사이트라 서버가 직접 데이터를 긁어올 방법이 없다). 그래서 이 모듈은
 *    두 가지 "실시간에 가까운" 경로를 지원하고, 코드 수정 없이 .env 설정만으로
 *    전환할 수 있게 만들었다:
 *
 *    1) HOMETOWN_REWARDS_SOURCE_URL — 지자체나 팀이 직접 운영하는 JSON API가
 *       있다면 그 URL을 그대로 넣는다 (예: 사내에서 답례품 목록을 자체 API로
 *       만들어 두었을 경우). 매 요청마다 최신 데이터를 그대로 가져온다.
 *
 *    2) HOMETOWN_REWARDS_LOCAL_FILE — 공식 API가 없는 현실적인 대안으로,
 *       사람이 주기적으로 갱신하는 JSON 파일 경로를 지정한다. busanlove.kr 등에서
 *       확인한 답례품 정보를 이 파일에 옮겨 적어두면, 서버 재배포 없이
 *       파일만 바꿔도 화면에 바로 반영된다 (파일 변경 시각 기준 캐시 무효화).
 *
 *    무엇도 설정하지 않으면 null을 돌려주고, 호출부(routes/hometown.js)가
 *    정적 목록으로 조용히 폴백한다 (heritage.js와 동일한 원칙).
 */

const SOURCE_URL = process.env.HOMETOWN_REWARDS_SOURCE_URL || "";
const LOCAL_FILE = process.env.HOMETOWN_REWARDS_LOCAL_FILE || "";
const CACHE_MS = 10 * 60 * 1000; // 10분

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SAMPLE_FILE = path.join(__dirname, "..", "..", "data", "hometown-rewards.sample.json");

let cache = { at: 0, items: null, mtimeMs: 0 };

export function isConfigured() {
  return Boolean(SOURCE_URL || LOCAL_FILE);
}

/** 자주 쓰일 법한 필드명 후보를 순서대로 시도해 사람이 읽을 수 있는 형태로 정규화한다. */
function normalizeItem(raw, idx) {
  const pick = (...keys) => keys.map((k) => raw?.[k]).find((v) => v !== undefined && v !== null && v !== "");
  const name = pick("name", "productName", "title", "rewardName") || `답례품 ${idx + 1}`;
  const region = pick("region", "city", "local_government", "지자체", "sido");
  const category = pick("category", "type", "분류");
  const amount = pick("minDonation", "min_amount", "기부금액", "amount");
  const image = pick("image", "imageUrl", "thumbnail", "이미지");
  return {
    id: pick("id", "productId") ?? `reward-${idx}`,
    name: String(name),
    region: region ? String(region) : undefined,
    category: category ? String(category) : undefined,
    minDonation: amount !== undefined ? Number(amount) || amount : undefined,
    image: image ? String(image) : undefined,
  };
}

function extractItems(json) {
  const items = Array.isArray(json) ? json : json?.items ?? json?.data ?? json?.list ?? [];
  return Array.isArray(items) ? items : items ? [items] : [];
}

async function fetchFromUrl() {
  const res = await fetch(SOURCE_URL, { headers: { Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`고향사랑기부 답례품 소스 오류 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    const err = new Error("고향사랑기부 답례품 소스가 JSON이 아닌 응답을 반환했습니다.");
    err.status = 502;
    throw err;
  }
  return extractItems(json).map(normalizeItem);
}

async function fetchFromLocalFile() {
  const filePath = LOCAL_FILE ? path.resolve(LOCAL_FILE) : DEFAULT_SAMPLE_FILE;
  const raw = await readFile(filePath, "utf-8");
  const json = JSON.parse(raw);
  return extractItems(json).map(normalizeItem);
}

/**
 * 답례품 목록을 가져온다.
 *
 * - HOMETOWN_REWARDS_SOURCE_URL이 있으면 그 API를 그대로 호출한다.
 * - 없고 HOMETOWN_REWARDS_LOCAL_FILE이 있으면 그 경로의 JSON 파일을 읽는다.
 * - 둘 다 없으면 팀이 미리 채워둔 샘플 답례품 파일(data/hometown-rewards.sample.json)로
 *   자동 폴백한다 — 완전한 정적 하드코딩보다는, 코드 재배포 없이 파일만 갱신하면
 *   되는 이 방식이 "현실적인 실시간" 대안이다.
 *
 * 파일을 읽는 것조차 실패하면(파일이 없거나 JSON이 깨진 경우 등) null을 돌려주고,
 * 호출부(routes/hometown.js)가 화면에 원래 있던 정적 목록으로 최종 폴백한다.
 */
export async function getHometownRewards() {
  const now = Date.now();
  if (cache.items && now - cache.at < CACHE_MS) return cache.items;

  try {
    const items = SOURCE_URL ? await fetchFromUrl() : await fetchFromLocalFile();
    cache = { at: now, items };
    return items;
  } catch (err) {
    // 사용자 지정 소스가 실패했을 때만 여기서 조용히 null로 폴백한다.
    // (source: "live" 여부는 routes/hometown.js가 판단한다)
    if (isConfigured()) throw err; // 사용자가 직접 설정한 경우엔 오류를 그대로 올려 원인을 알 수 있게 한다
    return null;
  }
}
