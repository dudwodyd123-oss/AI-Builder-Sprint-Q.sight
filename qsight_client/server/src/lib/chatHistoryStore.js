/**
 * AI 챗봇 대화 기록 저장소 (파일 기반 JSON store).
 *
 * heritageStore.js / hometownStore.js와 같은 방식이다 — 로그인이 없으므로 레코드
 * 하나당 JSON 파일 하나로 저장하고, 브라우저가 들고 있는 id 목록으로만 다시 조회한다.
 * (server/src/lib/heritageStore.js 참고)
 *
 * 지금까지는 문화유산/고향사랑기부 접수 시점에만 대화가 "콘솔 로그"로 남고 다시 볼 수
 * 없었다(heritage.js, hometown.js의 /pledges/:id/chat-log). 이 저장소는 그 대화를
 * 실제로 파일에 남겨서, 정기/일시 기부·유산기부까지 포함한 모든 AI 상담 대화를
 * 마이페이지에서 나중에 다시 볼 수 있게 한다.
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
  "chat-history"
);

const ID_RE = /^cv_[a-f0-9]{24}$/;

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
  const err = new Error("대화 기록을 찾을 수 없습니다.");
  err.status = 404;
  err.code = "CHAT_HISTORY_NOT_FOUND";
  return err;
}

/** 쓰다 만 파일이 남지 않도록 임시 파일에 쓰고 이름을 바꾼다 (다른 *Store.js와 동일) */
async function writeJson(record) {
  await ensureDir();
  const target = jsonPath(record.id);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(record, null, 2), "utf-8");
  await rename(tmp, target);
  return record;
}

/**
 * 대화 하나를 저장한다. messages는 { role, content } 배열을 그대로 받는다.
 * context는 이 대화가 어떤 화면에서 나왔는지 사람이 읽을 라벨
 * ("정기/일시 기부" | "문화유산 후원" | "고향사랑기부" | "유산기부").
 */
export async function createConversation(data = {}) {
  const now = new Date().toISOString();
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const record = {
    id: `cv_${randomBytes(12).toString("hex")}`,
    created_at: now,
    updated_at: now,
    context: data.context || "AI 상담",
    program_id: data.program_id || null,
    program_name: data.program_name || null,
    related_id: data.related_id || null, // 문화유산/고향사랑기부 접수 id 등 (있으면)
    turns: messages.filter((m) => m.role === "user").length,
    messages: messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: String(m.content ?? ""),
    })),
  };
  return writeJson(record);
}

export async function readConversation(id) {
  if (!isValidId(id)) throw notFound();
  try {
    return JSON.parse(await readFile(jsonPath(id), "utf-8"));
  } catch {
    throw notFound();
  }
}

/** 마이페이지용 — 브라우저가 들고 있는 id 목록으로만 조회한다 (로그인이 없으므로) */
export async function listConversations(ids = []) {
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
