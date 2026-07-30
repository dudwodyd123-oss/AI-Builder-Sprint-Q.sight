import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";

import { initDb } from "./lib/store.js";
import chatRouter from "./routes/chat.js";
import pledgesRouter from "./routes/pledges.js";
import documentsRouter from "./routes/documents.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(morgan("dev"));
// base64 PDF payload가 오갈 수 있으므로 body 한도를 넉넉하게 설정
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "qsight-server", time: new Date().toISOString() });
});

app.use("/api/chat", chatRouter);
app.use("/api/pledges", pledgesRouter);
app.use("/api", documentsRouter); // /api/pledges/:id/document, /api/documents...

// 404
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "요청한 API를 찾을 수 없습니다." });
});

// 공통 에러 핸들러
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({ error: err.message || "서버 오류가 발생했습니다." });
});

await initDb();
app.listen(PORT, () => {
  console.log(`Q.sight server가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
