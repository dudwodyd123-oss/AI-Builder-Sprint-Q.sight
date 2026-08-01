import { Router } from "express";
import { isConfigured, listDocuments, getDocument, downloadDocumentFile } from "../lib/modusign.js";

const router = Router();

/** 목록·상세에서 화면에 필요한 것만 추린다 (개인정보를 그대로 흘리지 않기 위해) */
function toSummary(doc) {
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    signed: doc.status === "COMPLETED",
    requesterName: doc.requester?.name || null,
    participants: (doc.participants || []).map((p) => ({
      name: p.name,
      email: p.signingMethod?.value || null,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** GET /api/documents - 내 모두싸인 계정으로 볼 수 있는 문서 목록 */
router.get("/", async (_req, res) => {
  if (!isConfigured()) {
    return res.json({ documents: [], configured: false });
  }
  try {
    const documents = await listDocuments();
    res.json({ documents: documents.map(toSummary), configured: true });
  } catch (e) {
    console.error("[documents:list] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** GET /api/documents/:documentId - 문서 상세 */
router.get("/:documentId", async (req, res) => {
  try {
    const doc = await getDocument(req.params.documentId);
    res.json({ document: toSummary(doc) });
  } catch (e) {
    console.error("[documents:get] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** GET /api/documents/:documentId/file - 서명된 계약서 PDF (미리보기용) */
router.get("/:documentId/file", async (req, res) => {
  try {
    const { buffer, title } = await downloadDocumentFile(req.params.documentId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(`${title || "약정서"}.pdf`)}`
    );
    res.send(buffer);
  } catch (e) {
    console.error("[documents:file] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

export default router;
