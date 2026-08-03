import { Router } from "express";
import { getHometownRewards, isConfigured } from "../lib/hometownRewards.js";
import {
  createHometownPledge,
  readHometownPledge,
  listHometownPledges,
} from "../lib/hometownStore.js";
import { runSimpleChat } from "../lib/simpleChat.js";

const router = Router();

/** 사용자 지정 소스도, 샘플 파일도 읽지 못했을 때 보여줄 최종 폴백 목록. */
const STATIC_REWARDS = [
  {
    id: "static-1",
    name: "지역 특산물 세트",
    region: "강원 양양군",
    category: "농축산물",
    image: "https://cdn.pixabay.com/photo/2015/01/16/15/02/market-601580_1280.jpg",
  },
  {
    id: "static-2",
    name: "대나무 공예품",
    region: "전남 담양군",
    category: "생활용품",
    image: "https://cdn.pixabay.com/photo/2015/12/03/08/50/bamboo-1074139_1280.jpg",
  },
  {
    id: "static-3",
    name: "마늘 한 접",
    region: "경북 의성군",
    category: "농축산물",
    image: "https://cdn.pixabay.com/photo/2015/01/31/11/31/garlic-618400_1280.jpg",
  },
  {
    id: "static-4",
    name: "구기자 선물세트",
    region: "충남 청양군",
    category: "농축산물",
    image: "https://cdn.pixabay.com/photo/2016/04/13/18/56/range-1327426_1280.jpg",
  },
  {
    id: "static-5",
    name: "감귤 선물세트",
    region: "제주 서귀포시",
    category: "농축산물",
    image: "https://cdn.pixabay.com/photo/2016/04/08/22/41/tangerine-1317149_1280.png",
  },
];

/** 화면에 내보낼 신청 내역 (내부 필드를 그대로 노출하지 않는다) */
function publicPledge(record) {
  return {
    id: record.id,
    createdAt: record.created_at,
    target: record.target,
    rewardId: record.reward_id,
    amount: record.amount,
    donorName: record.donor_name,
    donorPhone: record.donor_phone,
    status: record.status,
  };
}

router.get("/", async (_req, res) => {
  try {
    const items = await getHometownRewards();
    if (items && items.length) {
      return res.json({ items, source: isConfigured() ? "live" : "sample" });
    }
    return res.json({ items: STATIC_REWARDS, source: "static" });
  } catch (e) {
    console.error("[hometown] 답례품 목록 조회 실패:", e.message);
    return res.json({ items: STATIC_REWARDS, source: "static", error: e.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({ configured: isConfigured() });
});

const MIN_AMOUNT = 10000;

/** POST /api/hometown/pledges — 고향사랑기부 신청 접수 */
router.post("/pledges", async (req, res) => {
  try {
    const { target, rewardId, amount, donorName, donorPhone, source } = req.body || {};

    const errors = {};
    if (!String(target || "").trim()) errors.target = "기부할 지자체를 선택해주세요.";
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum < MIN_AMOUNT) {
      errors.amount = `기부 금액은 ${MIN_AMOUNT.toLocaleString()}원 이상이어야 합니다.`;
    }
    if (!String(donorName || "").trim()) errors.donorName = "이름을 입력해주세요.";
    if (!String(donorPhone || "").trim()) errors.donorPhone = "연락처를 입력해주세요.";

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        error: "입력값을 다시 확인해주세요.",
        code: "INVALID_INPUT",
        fields: errors,
      });
    }

    const record = await createHometownPledge({
      target: String(target).trim(),
      reward_id: rewardId || null,
      amount: amountNum,
      donor_name: String(donorName).trim(),
      donor_phone: String(donorPhone).trim(),
      source: source === "live" || source === "sample" ? source : "static",
    });

    res.status(201).json({ pledge: publicPledge(record) });
  } catch (e) {
    console.error("[hometown:pledges:create] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** GET /api/hometown/pledges/:id — 신청 확인용 조회 */
router.get("/pledges/:id", async (req, res) => {
  try {
    const record = await readHometownPledge(req.params.id);
    res.json({ pledge: publicPledge(record) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * POST /api/hometown/pledges/:id/chat-log — 챗봇 대화 저장.
 *
 * 다시 불러와 보여줄 필요는 없다는 요건이라, 별도 저장소 없이 서버 콘솔 로그로만 남긴다.
 * (routes/heritage.js의 /pledges/:id/chat-log와 같은 방식)
 */
router.post("/pledges/:id/chat-log", (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages 배열이 필요합니다." });
  }
  console.log(
    `[hometown:chat-log] pledge=${req.params.id} savedAt=${new Date().toISOString()} turns=${messages.length}`
  );
  for (const m of messages) {
    console.log(`[hometown:chat-log]   ${m.role}: ${m.content}`);
  }
  res.status(201).json({ saved: true });
});

/** POST /api/hometown/pledges/lookup — 마이페이지용. 브라우저가 들고 있는 id 목록만 조회한다 */
router.post("/pledges/lookup", async (req, res) => {
  try {
    const records = await listHometownPledges(req.body?.ids || []);
    res.json({ pledges: records.map(publicPledge) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * POST /api/hometown/chat — 고향사랑기부 신청서 작성용 챗봇.
 * 후원 대상(지자체)은 화면에서 카드/드롭다운으로 고르므로 챗봇 수집 대상에서 뺀다.
 * (server/src/lib/simpleChat.js, routes/heritage.js의 /chat과 같은 방식)
 */
const CHAT_FIELDS = [
  { key: "amount", label: "기부 금액", type: "number", required: true },
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
    console.error("[hometown:chat] error:", e.message);
    res.status(e.status || 500).json({ error: e.message || "챗봇 응답 중 오류가 발생했습니다.", code: e.code });
  }
});

export default router;
