/**
 * 고향사랑기부 신청 저장소 (파일 기반 JSON store).
 *
 * heritageStore.js와 같은 방식이다 — 전자서명·녹음이 필요 없는 단순 신청이라
 * 레코드 하나당 JSON 파일 하나로 저장한다. (server/src/lib/heritageStore.js 참고)
 */

import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "hometown"
);

const ID_RE = /^hm_[a-f0-9]{24}$/;

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function jsonPath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

export function isValidId(id) {
  return ID_RE.test(String(id || ""));
}

function notFound() {
  const err = new Error("기부 신청 내역을 찾을 수 없습니다.");
  err.status = 404;
  err.code = "HOMETOWN_PLEDGE_NOT_FOUND";
  return err;
}

async function writeJson(record) {
  await ensureDir();
  const target = jsonPath(record.id);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(record, null, 2), "utf-8");
  await rename(tmp, target);
  return record;
}

export async function createHometownPledge(data = {}) {
  const now = new Date().toISOString();
  const record = {
    id: `hm_${randomBytes(12).toString("hex")}`,
    created_at: now,
    updated_at: now,
    target: data.target || null,
    reward_id: data.reward_id || null,
    amount: data.amount,
    donor_name: data.donor_name,
    donor_phone: data.donor_phone,
    source: data.source || "static", // 신청 시점 목록이 실시간/샘플이었는지(live/sample) 정적이었는지(static)
    status: "접수됨",
  };
  return writeJson(record);
}

export async function readHometownPledge(id) {
  if (!isValidId(id)) throw notFound();
  try {
    return JSON.parse(await readFile(jsonPath(id), "utf-8"));
  } catch {
    throw notFound();
  }
}

/** 마이페이지용 — 브라우저가 들고 있는 id 목록으로만 조회한다 (로그인이 없으므로) */
export async function listHometownPledges(ids = []) {
  const wanted = ids.filter(isValidId);
  if (wanted.length === 0) return [];
  await ensureDir();
  const files = new Set(await readdir(DATA_DIR));
  const out = [];
  for (const id of wanted) {
    if (!files.has(`${id}.json`)) continue;
    out.push(JSON.parse(await readFile(jsonPath(id), "utf-8")));
  }
  return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
