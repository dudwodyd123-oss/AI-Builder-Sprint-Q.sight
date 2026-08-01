/**
 * 유산기부 등록 저장소 (파일 기반 JSON store).
 *
 * 개인용 서버는 원래 상태를 갖지 않지만, 녹음 파일과 그때 읽은 대본은
 * 어딘가에 남아야 한다. 기업용에 보내지 않기 때문이다 — 생전에 기관이
 * 유언 내용을 열람하면 분쟁 소지가 된다. (계획서 §9)
 *
 * 레코드 하나당 JSON 파일 하나, 녹음은 같은 이름의 오디오 파일로 나란히 둔다.
 */

import { mkdir, readFile, writeFile, rename, readdir, access } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "legacy"
);

const ID_RE = /^lg_[a-f0-9]{24}$/;

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function jsonPath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

/** id는 URL에서 그대로 오므로 형식을 강제해 경로 조작을 막는다 */
export function isValidId(id) {
  return ID_RE.test(String(id || ""));
}

function notFound() {
  const err = new Error("유산기부 등록을 찾을 수 없습니다.");
  err.status = 404;
  err.code = "LEGACY_NOT_FOUND";
  return err;
}

/** 쓰다 만 파일이 남지 않도록 임시 파일에 쓰고 이름을 바꾼다 */
async function writeJson(record) {
  await ensureDir();
  const target = jsonPath(record.id);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(record, null, 2), "utf-8");
  await rename(tmp, target);
  return record;
}

export async function createRecord(data = {}) {
  const now = new Date().toISOString();
  const record = {
    id: `lg_${randomBytes(12).toString("hex")}`,
    created_at: now,
    updated_at: now,
    spec_version: data.spec_version || null,
    program_id: data.program_id || null,
    program_name: data.program_name || null,
    consent: data.consent || {},
    values: data.values || {},
    script_overrides: data.script_overrides || {},
    script_rendered: null,
    script_spec_version: null,
    // 다시 녹음하는 경우 기존 등록에서 물려받는다 (기부 의사 등록을 새로 하지 않기 위해)
    agreement_id: data.agreement_id || null,
    document_id: data.document_id || null,
    witness: data.witness || null,
    supersedes: data.supersedes || null, // 이 등록이 대신하는 이전 등록
    superseded_by: null, // 이 등록을 대신한 새 등록
    recording: null,
    checklist: [],
  };
  return writeJson(record);
}

export async function readRecord(id) {
  if (!isValidId(id)) throw notFound();
  try {
    return JSON.parse(await readFile(jsonPath(id), "utf-8"));
  } catch {
    throw notFound();
  }
}

/** 얕은 병합. 중첩 객체(values 등)는 호출부가 합쳐서 통째로 넘긴다. */
export async function updateRecord(id, patch = {}) {
  const record = await readRecord(id);
  const next = { ...record, ...patch, id: record.id, created_at: record.created_at };
  next.updated_at = new Date().toISOString();
  return writeJson(next);
}

export function recordingPath(id, ext = "webm") {
  return path.join(DATA_DIR, `${id}.${ext}`);
}

/**
 * 녹음 저장. 파일과 함께 SHA-256 해시와 시각을 레코드에 남긴다.
 * 나중에 "이 파일이 그때 그 녹음인가"를 확인할 수 있어야 하기 때문이다.
 */
export async function saveRecording(id, buffer, { mime = "audio/webm", durationMs = null } = {}) {
  const record = await readRecord(id);
  await ensureDir();

  const ext = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mp4")
      ? "mp4"
      : mime.includes("wav")
        ? "wav"
        : "webm";
  const file = recordingPath(record.id, ext);
  await writeFile(file, buffer);

  return {
    file: path.basename(file),
    mime,
    bytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    duration_ms: durationMs,
    recorded_at: new Date().toISOString(),
  };
}

export async function openRecording(record) {
  if (!record.recording?.file) return null;
  const file = path.join(DATA_DIR, path.basename(record.recording.file));
  try {
    await access(file);
  } catch {
    return null;
  }
  return createReadStream(file);
}

/** 마이페이지용 — 브라우저가 들고 있는 id 목록으로만 조회한다 (로그인이 없으므로) */
export async function listRecords(ids = []) {
  const wanted = ids.filter(isValidId);
  if (wanted.length === 0) return [];
  await ensureDir();
  const files = new Set(await readdir(DATA_DIR));
  const out = [];
  for (const id of wanted) {
    if (!files.has(`${id}.json`)) continue;
    out.push(await readRecord(id));
  }
  return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
