import fetch from "node-fetch";

const BASE_URL = process.env.UPSTAGE_BASE_URL || "https://api.upstage.ai/v1";
const MODEL = process.env.UPSTAGE_MODEL || "solar-pro2";
const API_KEY = process.env.UPSTAGE_API_KEY;

/**
 * Upstage Solar Chat Completions (OpenAI 호환 스펙)
 * https://api.upstage.ai/v1/chat/completions
 */
async function callUpstage(payload) {
  if (!API_KEY) {
    throw new Error("UPSTAGE_API_KEY가 설정되지 않았습니다. server/.env를 확인하세요.");
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, stream: false, ...payload }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Upstage API 오류 (${res.status}): ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/**
 * tool call로 구조화된 인자를 받아온다.
 *
 * 응답 본문에서 ```json 블록을 정규식으로 긁어내는 방식보다 훨씬 안정적이다.
 * (모델이 값을 빠뜨리거나 설명 문장에 섞어버리는 일이 줄어든다)
 *
 * @param tool OpenAI function 스펙 { name, description, parameters }
 * @returns tool call의 arguments 객체. 호출이 없으면 빈 객체.
 */
export async function upstageToolCall(messages, tool, { temperature = 0 } = {}) {
  const data = await callUpstage({
    messages,
    temperature,
    tools: [{ type: "function", function: tool }],
    tool_choice: { type: "function", function: { name: tool.name } },
  });

  const call = data?.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === tool.name);
  if (!call) return {};
  try {
    return JSON.parse(call.function.arguments);
  } catch {
    return {};
  }
}
