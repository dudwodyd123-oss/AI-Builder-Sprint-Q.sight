import { Router } from "express";
import { createConversation, readConversation, listConversations } from "../lib/chatHistoryStore.js";

const router = Router();

/** 화면에 내보낼 대화 기록 (내부 필드를 그대로 노출하지 않는다) */
function publicConversation(record) {
  return {
    id: record.id,
    createdAt: record.created_at,
    context: record.context,
    programId: record.program_id,
    programName: record.program_name,
    relatedId: record.related_id,
    turns: record.turns,
    messages: record.messages,
  };
}

/**
 * POST /api/chat-history — AI 상담 대화 저장.
 *
 * 정기/일시 기부, 유산기부, 문화유산 후원, 고향사랑기부 — 어떤 화면의 챗봇이든
 * 이 엔드포인트로 대화를 저장하면 마이페이지에서 다시 불러와 볼 수 있다.
 * (기존 heritage.js / hometown.js의 chat-log는 콘솔 로그만 남기던 것과 달리,
 * 이건 실제로 파일에 저장해서 나중에 조회 가능하게 한다)
 */
router.post("/", async (req, res) => {
  try {
    const { context, programId, programName, relatedId, messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages 배열이 필요합니다." });
    }
    const record = await createConversation({
      context,
      program_id: programId,
      program_name: programName,
      related_id: relatedId,
      messages,
    });
    res.status(201).json({ conversation: publicConversation(record) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** POST /api/chat-history/lookup — 마이페이지용. 브라우저가 들고 있는 id 목록만 조회한다 */
router.post("/lookup", async (req, res) => {
  try {
    const records = await listConversations(req.body?.ids || []);
    res.json({ conversations: records.map(publicConversation) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** GET /api/chat-history/:id — 대화 기록 상세 조회 */
router.get("/:id", async (req, res) => {
  try {
    const record = await readConversation(req.params.id);
    res.json({ conversation: publicConversation(record) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

export default router;
