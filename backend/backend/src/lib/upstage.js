import fetch from "node-fetch";

const BASE_URL = process.env.UPSTAGE_BASE_URL || "https://api.upstage.ai/v1";
const MODEL = process.env.UPSTAGE_MODEL || "solar-pro2";
const API_KEY = process.env.UPSTAGE_API_KEY;

/**
 * Upstage Solar Chat Completions (OpenAI 호환 스펙)
 * https://api.upstage.ai/v1/chat/completions
 * Authorization: Bearer <UPSTAGE_API_KEY>
 */
export async function upstageChat(messages, { temperature = 0.6, model } = {}) {
  if (!API_KEY) {
    throw new Error("UPSTAGE_API_KEY가 설정되지 않았습니다. server/.env를 확인하세요.");
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: model || MODEL,
      messages,
      temperature,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Upstage API 오류 (${res.status}): ${text}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  return { content, raw: data };
}

/**
 * 대화 내용을 기반으로 </json> 블록에 담긴 구조화된 요약을 파싱합니다.
 * 챗봇 시스템 프롬프트에서 충분한 정보가 모이면 응답 끝에
 * ```json { ... } ``` 형태의 요약 블록을 추가하도록 지시합니다.
 */
export function extractSummaryJson(content) {
  const match = content.match(/```json\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** 챗봇 화면에 보여줄 때는 JSON 블록을 제거한 순수 대화 텍스트만 노출 */
export function stripSummaryBlock(content) {
  return content.replace(/```json[\s\S]*?```/i, "").trim();
}
