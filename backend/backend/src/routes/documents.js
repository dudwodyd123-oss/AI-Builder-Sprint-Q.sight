import { Router } from "express";
import { getPledge, updatePledge, saveDocument, updateDocument, listDocuments, getDocument } from "../lib/store.js";
import { generatePledgePdfBase64 } from "../lib/pdf.js";
import { requestSigning, getDocumentStatus } from "../lib/modusign.js";

const router = Router();

const TYPE_LABEL = {
  regular: "정기 기부 약정서",
  legacy: "유산 기부 약정서",
  hometown: "고향사랑기부 신청서",
  heritage: "문화유산 후원 약정서",
};

/** POST /api/pledges/:pledgeId/document - 약정서 PDF 자동 생성 및 저장 */
router.post("/pledges/:pledgeId/document", async (req, res) => {
  try {
    const pledge = await getPledge(req.params.pledgeId);
    if (!pledge) return res.status(404).json({ error: "약속을 찾을 수 없습니다." });

    const pdfBase64 = await generatePledgePdfBase64(pledge);
    const title = `${TYPE_LABEL[pledge.type] || "기부 약정서"} - ${pledge.donorName || "후원자"}`;
    const document = await saveDocument({
      pledgeId: pledge.id,
      title,
      pdfBase64,
      status: "generated",
    });
    await updatePledge(pledge.id, { status: "document_generated", documentId: document.id });

    res.status(201).json({ document });
  } catch (e) {
    console.error("[documents:generate] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** POST /api/pledges/:pledgeId/document/preview - 저장하지 않고 미리보기용 PDF만 생성 */
router.post("/pledges/:pledgeId/document/preview", async (req, res) => {
  try {
    const pledge = await getPledge(req.params.pledgeId);
    if (!pledge) return res.status(404).json({ error: "약속을 찾을 수 없습니다." });
    const merged = { ...pledge, ...(req.body || {}) };
    const pdfBase64 = await generatePledgePdfBase64(merged);
    res.json({ pdfBase64 });
  } catch (e) {
    console.error("[documents:preview] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** GET /api/documents - 나의 증서함 목록 */
router.get("/documents", async (_req, res) => {
  const documents = await listDocuments();
  res.json({ documents });
});

/** GET /api/documents/:id */
router.get("/documents/:id", async (req, res) => {
  const document = await getDocument(req.params.id);
  if (!document) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
  res.json({ document });
});

/**
 * POST /api/documents/:id/sign - 모두싸인으로 전자서명 요청 전송
 * body: { signerName, signerEmail }
 */
router.post("/documents/:id/sign", async (req, res) => {
  try {
    const document = await getDocument(req.params.id);
    if (!document) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
    const { signerName, signerEmail } = req.body || {};
    if (!signerName || !signerEmail) {
      return res.status(400).json({ error: "signerName, signerEmail이 필요합니다." });
    }

    const result = await requestSigning({
      title: document.title,
      pdfBase64: document.pdfBase64,
      signerName,
      signerEmail,
    });

    const updated = await updateDocument(document.id, {
      status: result.status || "ON_PROCESSING",
      modusignDocumentId: result.id,
      signerName,
      signerEmail,
    });

    if (document.pledgeId) {
      await updatePledge(document.pledgeId, { status: "signing" });
    }

    res.json({ document: updated, modusign: result });
  } catch (e) {
    console.error("[documents:sign] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, detail: e.data });
  }
});

/** GET /api/documents/:id/status - 모두싸인 서명 상태 조회 (폴링) */
router.get("/documents/:id/status", async (req, res) => {
  try {
    const document = await getDocument(req.params.id);
    if (!document) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
    if (!document.modusignDocumentId) {
      return res.json({ document, status: document.status || "generated" });
    }

    const modusign = await getDocumentStatus(document.modusignDocumentId);
    const status = modusign.status || document.status;
    const updated = await updateDocument(document.id, {
      status,
      downloadUrl: modusign?.file?.downloadUrl || document.downloadUrl,
    });

    if (status === "COMPLETED" && updated.pledgeId) {
      await updatePledge(updated.pledgeId, { status: "completed" });
    }

    res.json({ document: updated, modusign });
  } catch (e) {
    console.error("[documents:status] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, detail: e.data });
  }
});

export default router;
