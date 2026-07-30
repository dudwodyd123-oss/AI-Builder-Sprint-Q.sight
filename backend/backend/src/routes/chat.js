import { Router } from "express";
import { upstageChat, extractSummaryJson, stripSummaryBlock } from "../lib/upstage.js";
import { buildSystemPrompt } from "../lib/prompts.js";

const router = Router();

/**
 * POST /api/chat
 * body: { type: "regular"|"legacy"|"hometown"|"heritage", messages: [{role:"user"|"assistant", content}] }
 * res: { reply, summary, ready }
 */
router.post("/", async (req, res) => {
  try {
    const { type = "regular", messages = [] } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages 배열이 필요합니다." });
    }

    const systemPrompt = buildSystemPrompt(type);
    const upstageMessages = [{ role: "system", content: systemPrompt }, ...messages];

    const { content } = await upstageChat(upstageMessages);
    const summary = extractSummaryJson(content);
    const reply = stripSummaryBlock(content);

    res.json({ reply, summary, ready: Boolean(summary) });
  } catch (e) {
    console.error("[chat] error:", e.message);
    res.status(e.status || 500).json({ error: e.message || "챗봇 응답 중 오류가 발생했습니다." });
  }
});

export default router;
