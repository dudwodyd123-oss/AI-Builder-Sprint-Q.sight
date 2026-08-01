import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import { CORP_BASE_URL } from "./lib/corp.js";
import { isConfigured as modusignConfigured } from "./lib/modusign.js";
import { loadLegacySpec } from "./lib/legacySpec.js";
import chatRouter from "./routes/chat.js";
import programsRouter from "./routes/programs.js";
import agreementsRouter from "./routes/agreements.js";
import documentsRouter from "./routes/documents.js";
import legacyRouter from "./routes/legacy.js";

const app = express();
const PORT = process.env.PORT || 4000;

/**
 * 유산기부 대본 스펙은 기동 시에 검증한다.
 * 법정 요건 문장이 빠진 대본으로 서버가 뜨면 유언이 통째로 무효가 되므로,
 * 검증에 실패하면 조용히 넘어가지 않고 기동을 멈춘다. (LEGACY_PLAN.md §2-5)
 */
let legacySpec;
try {
  legacySpec = loadLegacySpec();
} catch (e) {
  console.error(`[legacy-spec] ${e.message}`);
  console.error("server/config/legacy-spec.json을 고친 뒤 다시 실행해주세요.");
  process.exit(1);
}

app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "qsight-server",
    corpApi: CORP_BASE_URL,
    // 키가 없어도 서버는 뜨지만 해당 기능만 꺼진다. 어디가 꺼졌는지 한눈에 보이게 한다.
    upstage: process.env.UPSTAGE_API_KEY ? "on" : "off",
    modusign: modusignConfigured() ? "on" : "off",
    time: new Date().toISOString(),
  });
});

app.use("/api/chat", chatRouter);
app.use("/api/programs", programsRouter);
app.use("/api/agreements", agreementsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/legacy", legacyRouter);

// 404
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "요청한 API를 찾을 수 없습니다." });
});

// 공통 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({ error: err.message || "서버 오류가 발생했습니다." });
});

app.listen(PORT, () => {
  console.log(`Q.sight server가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`기업용 API: ${CORP_BASE_URL}`);
  console.log(`유산기부 대본 스펙: v${legacySpec.version} (검토: ${legacySpec.reviewed_by})`);

  // 키가 없으면 해당 기능만 꺼진 채로 뜬다. 무엇이 꺼졌는지 기동 로그에 남긴다.
  if (!process.env.UPSTAGE_API_KEY) {
    console.warn("");
    console.warn("⚠️  UPSTAGE_API_KEY가 없어 AI 챗봇 상담을 사용할 수 없습니다.");
    console.warn("    server/.env.example을 .env로 복사한 뒤 발급받은 키를 넣어주세요.");
    console.warn("    (사업 목록·약정·전자서명 등 나머지 기능은 그대로 동작합니다)");
  }
  if (!modusignConfigured()) {
    console.log("모두싸인 개인 계정 미연결 — 증서함의 서명 문서 목록만 비활성화됩니다.");
  }
});
