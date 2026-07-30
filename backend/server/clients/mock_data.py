"""모두싸인 자격증명이 없을 때 사용하는 데모 데이터 생성기.

실제 API를 연결하면 ModusignClient가 REST 응답을 여기와 똑같은 스키마로
정규화하므로, 화면·집계 코드는 mock/실API를 구분하지 않는다.

seed를 고정해서 새로고침해도 숫자가 흔들리지 않게 했다.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta

SEED = 20260730

SURNAMES = [
    "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
    "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍",
    "전", "고", "문", "손", "양", "배", "백", "허", "유", "남",
]

PROGRAMS = [
    {
        "id": "prog_1",
        "name": "금정산성 보존 지원",
        "goal_amount": 30_000_000,
        "start_date": "2026-03-01",
        "end_date": "2026-12-31",
        "methods": ["정기", "일시", "봉사"],
        "reward": "금정산 트레킹 이용권 외 2건",
        "template_id": "tpl_regular",
        "tags": ["문화재", "보존", "정기", "부산 금정구"],
        "description": "금정산성 성곽 보수와 주변 정비를 위한 상시 모금 사업입니다.",
    },
    {
        "id": "prog_2",
        "name": "근대건축물 기록화",
        "goal_amount": 18_000_000,
        "start_date": "2026-01-15",
        "end_date": "2026-11-30",
        "methods": ["정기", "일시"],
        "reward": "기록집 1부",
        "template_id": "tpl_regular",
        "tags": ["근대유산", "아카이브", "부산 중구"],
        "description": "원도심 근대건축물을 3D 스캔·사진으로 기록해 아카이브로 남깁니다.",
    },
    {
        "id": "prog_3",
        "name": "전통시장 아카이브",
        "goal_amount": 12_000_000,
        "start_date": "2026-02-01",
        "end_date": "2026-10-31",
        "methods": ["일시", "봉사"],
        "reward": "전통시장 상품권",
        "template_id": "tpl_onetime",
        "tags": ["생활유산", "구술채록", "부산 동구"],
        "description": "부산 전통시장 상인 구술 채록과 사진 아카이브 구축 사업입니다.",
    },
    {
        "id": "prog_4",
        "name": "청소년 문화유산 교실",
        "goal_amount": 9_000_000,
        "start_date": "2026-04-01",
        "end_date": "2026-12-15",
        "methods": ["정기", "봉사", "유산"],
        "reward": "감사패 · 연간 리포트",
        "template_id": "tpl_regular",
        "tags": ["교육", "청소년", "봉사"],
        "description": "지역 청소년 대상 문화유산 체험 교육 프로그램 운영비를 모읍니다.",
    },
]

TEMPLATES = [
    {
        "id": "tpl_regular",
        "name": "정기기부 약정 + 동의 3종",
        "updated_at": "2026-05-18",
        "fields": [
            {"key": "donor_name", "label": "기부자 성명", "type": "text", "assignee": "기부자"},
            {"key": "contact", "label": "연락처", "type": "text", "assignee": "기부자"},
            {"key": "program_name", "label": "대상 사업", "type": "select", "assignee": "담당자"},
            {"key": "amount", "label": "회차 금액", "type": "number", "assignee": "기부자"},
            {"key": "frequency", "label": "납부 주기", "type": "select", "assignee": "기부자"},
            {"key": "term_months", "label": "약정 기간", "type": "number", "assignee": "기부자"},
            {"key": "privacy_required", "label": "개인정보(필수)", "type": "check", "assignee": "기부자"},
            {"key": "privacy_optional", "label": "개인정보(선택)", "type": "check", "assignee": "기부자"},
            {"key": "motivation", "label": "기부 동기", "type": "textarea", "assignee": "기부자"},
            {"key": "sign_donor", "label": "서명란 · 기부자", "type": "sign", "assignee": "기부자"},
            {"key": "sign_org", "label": "서명란 · 담당자", "type": "sign", "assignee": "담당자"},
        ],
    },
    {
        "id": "tpl_onetime",
        "name": "일시기부 약정서",
        "updated_at": "2026-04-02",
        "fields": [
            {"key": "donor_name", "label": "기부자 성명", "type": "text", "assignee": "기부자"},
            {"key": "amount", "label": "기부 금액", "type": "number", "assignee": "기부자"},
            {"key": "program_name", "label": "대상 사업", "type": "select", "assignee": "담당자"},
            {"key": "sign_donor", "label": "서명란 · 기부자", "type": "sign", "assignee": "기부자"},
        ],
    },
    {
        "id": "tpl_volunteer",
        "name": "봉사 참여 약정서",
        "updated_at": "2026-03-27",
        "fields": [
            {"key": "donor_name", "label": "참여자 성명", "type": "text", "assignee": "기부자"},
            {"key": "program_name", "label": "대상 사업", "type": "select", "assignee": "담당자"},
            {"key": "term_months", "label": "참여 기간", "type": "number", "assignee": "기부자"},
            {"key": "sign_donor", "label": "서명란 · 참여자", "type": "sign", "assignee": "기부자"},
        ],
    },
    {
        "id": "tpl_legacy",
        "name": "유산기부 의향 확인서",
        "updated_at": "2026-06-11",
        "fields": [
            {"key": "donor_name", "label": "기부자 성명", "type": "text", "assignee": "기부자"},
            {"key": "asset_type", "label": "자산 유형", "type": "select", "assignee": "기부자"},
            {"key": "sign_donor", "label": "서명란 · 기부자", "type": "sign", "assignee": "기부자"},
            {"key": "sign_witness", "label": "서명란 · 입회인", "type": "sign", "assignee": "입회인"},
        ],
    },
]

# 와이어프레임 W1의 기부 유형 분포(정기 24 · 일시 9 · 봉사 6 · 유산 3)를 그대로 재현한다.
ACTIVE_MIX = {"정기": 24, "일시": 9, "봉사": 6, "유산": 3}
# 진행 중이 아닌 문서(서명 대기 / 거절 / 만료)
PENDING_COUNT = 6
REJECTED_COUNT = 2
EXPIRED_COUNT = 8

REGULAR_AMOUNTS = [10_000, 20_000, 30_000, 30_000, 50_000, 50_000, 100_000, 200_000]
ONETIME_AMOUNTS = [50_000, 100_000, 200_000, 300_000, 500_000, 1_000_000]
LEGACY_AMOUNTS = [5_000_000, 10_000_000, 30_000_000]

MOTIVATIONS = [
    "어릴 때 뛰놀던 산성이 그대로 남았으면 해서요.",
    "회사 동료들과 함께 지역에 보탬이 되고 싶었습니다.",
    "부모님 고향이 부산이라 마음이 갑니다.",
    "아이에게 물려줄 풍경을 지키고 싶습니다.",
    "작지만 오래 이어가는 방식이 좋아서 정기로 정했어요.",
]


def _mask(name: str) -> str:
    return name[0] + "○○"


def _iso(d: date) -> str:
    return d.isoformat()


def _month_start(d: date, delta_months: int = 0) -> date:
    y, m = d.year, d.month + delta_months
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, 1)


def _add_months(d: date, months: int) -> date:
    y, m = d.year, d.month + months
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


class _Gen:
    """문서 1건을 만드는 데 필요한 랜덤 상태를 들고 있는 헬퍼."""

    def __init__(self, today: date):
        self.rng = random.Random(SEED)
        self.today = today
        self.seq = 0
        self.used_names: set[str] = set()

    def _name(self) -> str:
        while True:
            name = self.rng.choice(SURNAMES) + self.rng.choice(
                ["민준", "서연", "도윤", "지우", "하준", "서준", "예은", "지호", "수아", "은우",
                 "지훈", "채원", "다은", "현우", "유진", "시우", "가은", "준서", "소율", "태윤"]
            )
            if name not in self.used_names:
                self.used_names.add(name)
                return name

    def _next_id(self, prefix: str = "doc") -> str:
        self.seq += 1
        return f"{prefix}_{1000 + self.seq}"

    # ── 이행 회차 생성 ────────────────────────────────────────
    def _installments(self, donation: dict, start: date) -> list[dict]:
        """정기 기부의 회차별 이행 내역. 일부는 지연/미이행으로 만든다."""
        rows: list[dict] = []
        # 월 납부는 매달, 봉사는 분기마다, 그 밖에는 연 1회로 회차를 잡는다.
        step = {"월": 1, "회": 3}.get(donation["frequency"], 12)
        total = max(1, donation["term_months"] // step)
        # 봉사는 금액이 없으므로 증빙도 영수증이 아니라 활동 확인서다.
        proof_kind = "확인서" if donation["type"] == "봉사" else "영수증"
        for i in range(total):
            due = _add_months(start, i * step)
            if due > self.today:
                rows.append({
                    "no": i + 1, "due_date": _iso(due), "paid_date": None,
                    "amount": donation["amount"], "proof_id": None, "status": "대기",
                })
                continue
            # 6개월보다 오래된 회차는 결국 정리된 것으로 본다.
            # 미이행은 최근 회차에서만 생겨야 "지연 N일"이 현실적인 값이 된다.
            settled = (self.today - due).days > 180
            roll = self.rng.random()
            on_time_p, paid_p = (0.90, 1.0) if settled else (0.72, 0.88)
            # 한 번 밀리면 다음 회차도 밀릴 확률이 높다(W3 연속 미이행 규칙 대상).
            if rows and rows[-1]["status"] == "미이행":
                on_time_p, paid_p = on_time_p - 0.45, paid_p - 0.45

            if roll < on_time_p:  # 정상 이행
                paid = due + timedelta(days=self.rng.randint(0, 3))
                rows.append({
                    "no": i + 1, "due_date": _iso(due), "paid_date": _iso(paid),
                    "amount": donation["amount"], "proof_id": f"prf_{self.seq}_{i+1}",
                    "proof_kind": proof_kind, "status": "완료",
                })
            elif roll < paid_p:  # 늦게 이행
                paid = due + timedelta(days=self.rng.randint(7, 25))
                rows.append({
                    "no": i + 1, "due_date": _iso(due), "paid_date": _iso(paid),
                    "amount": donation["amount"], "proof_id": f"prf_{self.seq}_{i+1}",
                    "proof_kind": proof_kind, "status": "지연 완료",
                })
            else:  # 미이행
                rows.append({
                    "no": i + 1, "due_date": _iso(due), "paid_date": None,
                    "amount": donation["amount"], "proof_id": None, "status": "미이행",
                })
        return rows

    def _history(self, doc: dict) -> list[dict]:
        """W4 진행 타임라인. 모두싸인 문서 이력 + 기관 이행 이력을 합친 형태."""
        events = [{"date": doc["requested_at"][:10], "event": "약정서 발송", "tag": "발송"}]
        for p in doc["participants"]:
            who = p.get("masked_name") or p["name"]
            if p.get("viewed_at"):
                events.append({"date": p["viewed_at"][:10], "event": f"{who} 문서 열람", "tag": "열람"})
            if p.get("signed_at"):
                events.append({"date": p["signed_at"][:10], "event": f"{who} 서명 완료", "tag": "완료"})
            if p.get("status") == "REJECTED":
                events.append({"date": p.get("rejected_at", doc["requested_at"])[:10], "event": f"{who} 서명 거절", "tag": "거절"})
        for inst in doc.get("installments", []):
            if inst["paid_date"]:
                events.append({
                    "date": inst["paid_date"],
                    "event": f"{inst['no']}회차 이행 · 영수증 매칭",
                    "tag": "자동" if inst["status"] == "완료" else "지연",
                })
        if doc.get("amendment"):
            events.append({"date": doc["amendment"]["date"], "event": "감액 → 부속합의서 재서명", "tag": "재서명"})
        return sorted(events, key=lambda e: e["date"])

    # ── 문서 1건 ─────────────────────────────────────────────
    def make(self, donation_type: str, doc_status: str) -> dict:
        rng = self.rng
        program = rng.choice([p for p in PROGRAMS if donation_type in p["methods"]] or PROGRAMS)
        name = self._name()
        doc_id = self._next_id()

        if donation_type == "정기":
            amount = rng.choice(REGULAR_AMOUNTS)
            frequency = "월"
            term_months = rng.choice([6, 12, 12, 12, 24, 36])
            template_id = "tpl_regular"
        elif donation_type == "일시":
            amount = rng.choice(ONETIME_AMOUNTS)
            frequency = "일시"
            term_months = 12  # 약정 유효기간. 회차 이행은 없다.
            template_id = "tpl_onetime"
        elif donation_type == "봉사":
            amount = 0
            frequency = "회"
            term_months = rng.choice([6, 12])
            template_id = "tpl_volunteer"
        else:  # 유산 — 사후 이행이라 월 예상 수입에는 잡지 않는다.
            amount = rng.choice(LEGACY_AMOUNTS)
            frequency = "유산"
            term_months = rng.choice([12, 24, 36])
            template_id = "tpl_legacy"

        # 진행 중 약정으로 보이려면 시작일이 약정 기간 안이어야 한다.
        months_ago = rng.randint(0, max(0, term_months - 2))
        start = _month_start(self.today, -months_ago) + timedelta(days=rng.randint(0, 20))
        requested = start - timedelta(days=rng.randint(1, 10))
        end = _add_months(start, term_months)

        participants = [{
            "id": f"{doc_id}_p1",
            "name": name,
            "masked_name": _mask(name),
            "role": "기부자",
            "email": f"donor{self.seq}@example.com",
            "phone": f"010-{rng.randint(1000, 9999)}-{rng.randint(1000, 9999)}",
            "status": "SIGNED",
            "viewed_at": None,
            "signed_at": None,
        }]

        if doc_status == "COMPLETED":
            viewed = requested + timedelta(days=rng.randint(0, 2))
            signed = viewed + timedelta(days=rng.randint(0, 3))
            participants[0].update(status="SIGNED", viewed_at=_iso(viewed), signed_at=_iso(signed))
            completed_at = _iso(signed)
        elif doc_status == "ON_GOING":
            # 서명 대기: 일부는 열람만 하고 서명하지 않은 상태(W3 위험 규칙 대상)
            requested = self.today - timedelta(days=rng.randint(3, 30))
            viewed = requested + timedelta(days=1) if rng.random() < 0.7 else None
            participants[0].update(
                status="VIEWED" if viewed else "SENT",
                viewed_at=_iso(viewed) if viewed else None,
                signed_at=None,
            )
            completed_at = None
        elif doc_status == "REJECTED":
            requested = self.today - timedelta(days=rng.randint(5, 60))
            participants[0].update(
                status="REJECTED",
                viewed_at=_iso(requested + timedelta(days=1)),
                signed_at=None,
                rejected_at=_iso(requested + timedelta(days=2)),
            )
            completed_at = None
        else:  # EXPIRED — 약정 기간이 끝난 문서
            months_ago = rng.randint(term_months + 1, term_months + 8)
            start = _month_start(self.today, -months_ago)
            requested = start - timedelta(days=3)
            end = _add_months(start, term_months)
            viewed = requested + timedelta(days=1)
            participants[0].update(status="SIGNED", viewed_at=_iso(viewed), signed_at=_iso(viewed))
            completed_at = _iso(viewed)

        donation = {
            "type": donation_type,
            "amount": amount,
            "frequency": frequency,
            "term_months": term_months,
            "program_id": program["id"],
            "program_name": program["name"],
            "start_date": _iso(start),
            "end_date": _iso(end),
            "receipt_required": donation_type != "봉사" and rng.random() < 0.85,
            "motivation": rng.choice(MOTIVATIONS),
        }

        doc = {
            "id": doc_id,
            "title": next(t["name"] for t in TEMPLATES if t["id"] == template_id),
            "template_id": template_id,
            "status": doc_status,
            "requested_at": _iso(requested),
            "completed_at": completed_at,
            "expires_at": _iso(end),
            "donor": {
                "id": f"donor_{self.seq}",
                "name": name,
                "masked_name": _mask(name),
                "email": participants[0]["email"],
                "phone": participants[0]["phone"],
            },
            "donation": donation,
            "participants": participants,
            "installments": [],
            "amendment": None,
        }

        # 유산·일시는 회차 이행이 없다.
        if doc_status in ("COMPLETED", "EXPIRED") and donation_type in ("정기", "봉사"):
            doc["installments"] = self._installments(donation, start)

        # 반복 감액 이력(W3 규칙 대상). 정기 기부 중 일부에만 부여한다.
        elapsed = max(0, (self.today - start).days // 30)
        if doc_status == "COMPLETED" and donation_type == "정기" and elapsed >= 2 and rng.random() < 0.25:
            before = amount * 2
            # 감액은 이미 지나간 시점이어야 이력으로 말이 된다.
            doc["amendment"] = {
                "date": _iso(_add_months(start, max(1, elapsed // 2))),
                "before_amount": before,
                "after_amount": amount,
                "reason": "기부자 요청 감액",
            }
            doc["amount_history"] = [
                {"date": _iso(start), "amount": before},
                {"date": doc["amendment"]["date"], "amount": amount},
            ]

        doc["history"] = self._history(doc)
        return doc


def build_dataset(today: date | None = None) -> dict:
    """데모용 문서/사업/템플릿 전체 묶음을 만든다."""
    today = today or date.today()
    gen = _Gen(today)
    documents: list[dict] = []

    for donation_type, count in ACTIVE_MIX.items():
        for _ in range(count):
            documents.append(gen.make(donation_type, "COMPLETED"))
    for _ in range(PENDING_COUNT):
        documents.append(gen.make(gen.rng.choice(["정기", "일시", "유산"]), "ON_GOING"))
    for _ in range(REJECTED_COUNT):
        documents.append(gen.make(gen.rng.choice(["정기", "일시"]), "REJECTED"))
    for _ in range(EXPIRED_COUNT):
        documents.append(gen.make(gen.rng.choice(["정기", "일시", "봉사"]), "EXPIRED"))

    documents.sort(key=lambda d: d["requested_at"], reverse=True)
    return {
        "documents": documents,
        "programs": [dict(p) for p in PROGRAMS],
        "templates": [dict(t) for t in TEMPLATES],
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }
