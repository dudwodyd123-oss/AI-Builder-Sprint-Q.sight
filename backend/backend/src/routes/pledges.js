import { Router } from "express";
import { createPledge, updatePledge, getPledge, listPledges } from "../lib/store.js";

const router = Router();

const TYPE_LABEL = {
  regular: "정기 기부",
  legacy: "유산 기부",
  hometown: "고향사랑기부",
  heritage: "문화유산 후원",
};

/** GET /api/pledges - 목록 (나의 증서함 등에서 사용) */
router.get("/", async (_req, res) => {
  const pledges = await listPledges();
  res.json({ pledges });
});

/** GET /api/pledges/:id */
router.get("/:id", async (req, res) => {
  const pledge = await getPledge(req.params.id);
  if (!pledge) return res.status(404).json({ error: "약속을 찾을 수 없습니다." });
  res.json({ pledge });
});

/**
 * POST /api/pledges - 새 약속 생성
 * body: { type, target, amount, period, startDate, donorName, donorPhone, declaration, extra, documentText }
 */
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.type || !TYPE_LABEL[body.type]) {
      return res.status(400).json({ error: "유효한 기부 유형(type)이 필요합니다." });
    }
    const pledge = await createPledge(body);
    res.status(201).json({ pledge });
  } catch (e) {
    console.error("[pledges:create] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** PATCH /api/pledges/:id - 약정서 확인/수정 화면에서 내용 수정 */
router.patch("/:id", async (req, res) => {
  const updated = await updatePledge(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: "약속을 찾을 수 없습니다." });
  res.json({ pledge: updated });
});

export default router;
