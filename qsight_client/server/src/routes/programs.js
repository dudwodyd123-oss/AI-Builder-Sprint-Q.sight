import { Router } from "express";
import { listPrograms, getLiveContractForm } from "../lib/corp.js";

const router = Router();

/** GET /api/programs - ① 모금 사업 목록 (기업용 API 중계) */
router.get("/", async (_req, res) => {
  try {
    const data = await listPrograms();
    res.json({ programs: data.rows || [] });
  } catch (e) {
    console.error("[programs:list] error:", e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

/**
 * GET /api/programs/:programId/contract-form - ② 계약 항목 스키마 (보관된 사업은 거부)
 * ?donationType=legacy 를 주면 유산기부 신청서 서식이 온다.
 */
router.get("/:programId/contract-form", async (req, res) => {
  try {
    const form = await getLiveContractForm(req.params.programId, req.query.donationType || "default");
    res.json({ form });
  } catch (e) {
    console.error("[programs:contract-form] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

export default router;
