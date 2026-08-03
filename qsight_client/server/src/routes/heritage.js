import { Router } from "express";
import { getHeritageList, isConfigured } from "../lib/heritage.js";
import { createHeritagePledge, readHeritagePledge, listHeritagePledges } from "../lib/heritageStore.js";
import { runSimpleChat } from "../lib/simpleChat.js";

const router = Router();

const PERIODS = new Set(["매월 자동이체", "일시 후원", "연 1회"]);
const MIN_AMOUNT = 10000;

/** 화면에 내보낼 신청 내역 (내부 필드를 그대로 노출하지 않는다) */
function publicPledge(record) {
  return {
    id: record.id,
    createdAt: record.created_at,
    target: record.target,
    heritageId: record.heritage_id,
    amount: record.amount,
    period: record.period,
    donorName: record.donor_name,
    donorPhone: record.donor_phone,
    status: record.status,
  };
}

/** 실시간 연동이 꺼져 있거나 실패했을 때 보여줄 기본 목록 (화면이 비지 않도록). */
const STATIC_HERITAGES = [
  {
    id: "static-1",
    name: "경복궁 보존회",
    category: "고궁",
    region: "서울",
    image:
      "https://cdn.pixabay.com/photo/2017/11/08/08/07/gyeongbok-palace-2929520_1280.jpg",
  },
  {
    id: "static-2",
    name: "불국사 문화유산 재단",
    category: "사찰",
    region: "경북 경주",
    image: "https://cdn.pixabay.com/photo/2021/09/03/00/32/bulguksa-temple-6594754_1280.jpg",
  },
  {
    id: "static-3",
    name: "종묘 제례 보존회",
    category: "제례",
    region: "서울",
    image: "https://cdn.pixabay.com/photo/2022/04/19/14/34/changdeokgung-palace-7143043_1280.jpg",
  },
  {
    id: "static-4",
    name: "한옥마을 보존 사업",
    category: "전통마을",
    region: "전북 전주",
    image: "https://cdn.pixabay.com/photo/2015/04/02/14/15/hanok-village-703824_1280.jpg",
  },
];

router.get("/", async (_req, res) => {
  try {
    const items = await getHeritageList();
    if (items && items.length) {
      return res.json({ items, source: "live" });
    }
    return res.json({ items: STATIC_HERITAGES, source: "static" });
  } catch (e) {
    console.error("[heritage] 문화유산 목록 조회 실패:", e.message);
    return res.json({ items: STATIC_HERITAGES, source: "static", error: e.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({ configured: isConfigured() });
});

/** POST /api/heritage/pledges — 문화유산 후원 신청 접수 */
router.post("/pledges", async (req, res) => {
  try {
    const {
      target,
      heritageId,
      amount,
      period,
      donorName,
      donorPhone,
      source,
    } = req.body || {};

    const errors = {};
    if (!String(target || "").trim()) errors.target = "후원 대상을 선택해주세요.";
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < MIN_AMOUNT) {
      errors.amount = `후원 금액은 ${MIN_AMOUNT.toLocaleString()}원 이상이어야 합니다.`;
    }
    if (period && !PERIODS.has(period)) errors.period = "후원 주기를 다시 선택해주세요.";
    if (!String(donorName || "").trim()) errors.donorName = "이름을 입력해주세요.";
    if (!String(donorPhone || "").trim()) errors.donorPhone = "연락처를 입력해주세요.";

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: "입력값을 다시 확인해주세요.",
        code: "INVALID_INPUT",
        fields: errors,
      });
    }

    const record = await createHeritagePledge({
      target: String(target).trim(),
      heritage_id: heritageId || null,
      amount: amountNum,
      period: period || PERIODS.values().next().value,
      donor_name: String(donorName).trim(),
      donor_phone: String(donorPhone).trim(),
      source: source === "live" ? "live" : "static",
    });

    res.status(201).json({ pledge: publicPledge(record) });
  } catch (e) {
    console.error("[heritage:pledges:create] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** GET /api/heritage/pledges/:id — 신청 확인용 조회 */
router.get("/pledges/:id", async (req, res) => {
  try {
    const record = await readHeritagePledge(req.params.id);
    res.json({ pledge: publicPledge(record) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * POST /api/heritage/pledges/:id/chat-log — 챗봇 대화 저장.
 *
 * 다시 불러와 보여줄 필요는 없다는 요건이라, 별도 저장소 없이 서버 콘솔 로그로만 남긴다.
 * (유산기부의 녹음 저장과 같은 결의 "신청 접수 시점에 남기는 기록"이지만, 여긴 서명이
 * 없는 단순 신청이라 파일로 보관하지 않고 로그만 남기면 충분하다)
 */
router.post("/pledges/:id/chat-log", (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages 배열이 필요합니다." });
  }
  console.log(
    `[heritage:chat-log] pledge=${req.params.id} savedAt=${new Date().toISOString()} turns=${messages.length}`
  );
  for (const m of messages) {
    console.log(`[heritage:chat-log]   ${m.role}: ${m.content}`);
  }
  res.status(201).json({ saved: true });
});

/** POST /api/heritage/pledges/lookup — 마이페이지용. 브라우저가 들고 있는 id 목록만 조회한다 */
router.post("/pledges/lookup", async (req, res) => {
  try {
    const records = await listHeritagePledges(req.body?.ids || []);
    res.json({ pledges: records.map(publicPledge) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * POST /api/heritage/chat — 문화유산 후원 신청서 작성용 챗봇.
 * 후원 대상(문화유산)은 화면에서 카드/드롭다운으로 고르므로 챗봇 수집 대상에서 뺀다.
 * (server/src/lib/simpleChat.js 참고 — 정기후원용 routes/chat.js와 같은 설계, 기관별
 * 계약서 스키마 조회만 생략한 가벼운 버전이다)
 */
const CHAT_FIELDS = [
  { key: "amount", label: "후원 금액", type: "number", required: true },
  { key: "period", label: "후원 주기", type: "select", options: ["매월 자동이체", "일시 후원", "연 1회"], required: true },
  { key: "donorName", label: "이름", type: "text", required: true },
  { key: "donorPhone", label: "연락처", type: "text", required: true },
];

router.post("/chat", async (req, res) => {
  try {
    const { messages = [], values = {} } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages 배열이 필요합니다." });
    }
    const result = await runSimpleChat({ fields: CHAT_FIELDS, messages, values });
    res.json(result);
  } catch (e) {
    console.error("[heritage:chat] error:", e.message);
    res.status(e.status || 500).json({ error: e.message || "챗봇 응답 중 오류가 발생했습니다.", code: e.code });
  }
});

export default router;
