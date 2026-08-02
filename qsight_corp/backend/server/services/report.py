"""W9 후원 리포트.

분기 후원 리포트 초안을 집계로 만들고, 초안 이력과 기부금영수증 대상을 관리한다.

⚠️ **아직 아무것도 발송하지 않는다.** 이메일·알림톡 채널이 연결되어 있지 않아
초안 숫자를 만들고 이력에 남기는 데까지만 한다. 그래서 이력 상태가 '발송 대기'다.
화면 문구도 '발행'이 아니라 '초안'으로 쓴다 — 담당자가 보냈다고 오해하면 안 된다.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from .. import config, store
from .donations import _d
from .legacy import LEGACY_TYPE

QUARTER_MONTHS = {1: (1, 3), 2: (4, 6), 3: (7, 9), 4: (10, 12)}


def quarter_of(d: date) -> int:
    return (d.month - 1) // 3 + 1


def quarter_range(year: int, quarter: int) -> tuple[date, date]:
    start_m, end_m = QUARTER_MONTHS[quarter]
    start = date(year, start_m, 1)
    end = date(year + (1 if end_m == 12 else 0), 1 if end_m == 12 else end_m + 1, 1)
    return start, end


def draft(documents: list[dict], year: int | None = None, quarter: int | None = None,
          today: date | None = None) -> dict:
    """선택한 분기의 리포트 초안 수치를 만든다."""
    today = today or date.today()
    year = year or today.year
    quarter = quarter or quarter_of(today)
    start, end = quarter_range(year, quarter)

    total_amount = 0
    donors: set[str] = set()
    completed = 0
    by_program: dict[str, int] = defaultdict(int)

    for doc in documents:
        # 유산기부는 사후 이행이라 이번 분기에 들어온 돈이 없다. 게다가 납부 주기가
        # 비어 있어 "일시"로 떨어지는 탓에 분기 후원자로 잡혔다. 낸 적 없는 분에게
        # "이번 분기 후원 리포트"를 보내게 되므로 여기서 뺀다.
        # (실제로 수령한 유산은 유산 약정 화면에서 따로 관리한다)
        if doc["donation"].get("type") == LEGACY_TYPE:
            continue

        donor_key = doc["donor"].get("id") or doc["donor"]["name"]
        program = doc["donation"].get("program_name", "미지정")

        # 분기 안에 실제로 들어온 회차 금액.
        # 금액이 0인 이행(봉사 등)은 후원금에도 수신자에도 넣지 않는다.
        # 넣으면 "총 후원금 0원 · 참여 기부자 2명" 같은 앞뒤가 안 맞는 리포트가 나온다.
        for inst in doc.get("installments", []):
            paid = _d(inst.get("paid_date"))
            amount = inst.get("amount") or 0
            if paid and amount > 0 and start <= paid < end:
                total_amount += amount
                by_program[program] += amount
                donors.add(donor_key)

        # 일시 기부는 약정 시작일 기준
        if doc["donation"]["frequency"] == "일시" and doc["status"] == "COMPLETED":
            s = _d(doc["derived"]["start_date"])
            amount = doc["donation"].get("amount") or 0
            if s and amount > 0 and start <= s < end:
                total_amount += amount
                by_program[program] += amount
                donors.add(donor_key)

        # 이 분기에 약정이 완료(만기 이행)된 건
        e = _d(doc["derived"]["end_date"])
        if e and start <= e < end and doc["status"] in ("COMPLETED", "EXPIRED"):
            completed += 1

    return {
        "year": year,
        "quarter": quarter,
        "title": f"{year}년 {quarter}분기 후원 리포트",
        "subtitle": "기부자에게 보낼 이행 보고 · 전체 사업 요약",
        # 발송 채널이 아직 없다. 화면이 이 값을 그대로 보여준다.
        "delivery": {
            "ready": False,
            "label": "발송 미연동",
            "note": "숫자만 만듭니다. 이메일·알림톡 발송은 아직 연결되지 않았습니다.",
        },
        "period": {
            "start": start.isoformat(),
            "end": date.fromordinal(end.toordinal() - 1).isoformat(),
        },
        "org_name": config.ORG_NAME,
        "stats": [
            {"label": "총 후원금", "value": round(total_amount / 1000), "unit": "천원"},
            {"label": "참여 기부자", "value": len(donors), "unit": "명"},
            {"label": "완료 약정", "value": completed, "unit": "건"},
        ],
        "by_program": sorted(
            ({"name": k, "amount": v} for k, v in by_program.items()),
            key=lambda r: r["amount"], reverse=True,
        ),
        "recipient_count": len(donors),
    }


def history() -> list[dict]:
    rows = store.read_list("reports")
    # 예전에 '발행 완료'로 남은 기록이 있다. 실제로 보낸 적이 없으므로 바로잡아 보여준다.
    for r in rows:
        r["status"] = "발송 대기"
        r.setdefault("created_at", r.get("published_at"))
    return sorted(rows, key=lambda r: (r.get("year", 0), r.get("quarter", 0)), reverse=True)


def save_draft(documents: list[dict], year: int, quarter: int) -> dict:
    """리포트 초안을 이력에 남긴다.

    ⚠️ **발송하지 않는다.** 이메일·알림톡 채널이 연결되어 있지 않아 수신 대상 수와
    만든 시각만 기록한다. 상태를 '발송 대기'로 두는 이유이고, 화면도 '발행'이라는
    말을 쓰지 않는다. 채널이 붙으면 여기에 발송 호출과 sent_at을 더하면 된다.
    """
    data = draft(documents, year, quarter)
    record = {
        "id": f"rpt_{year}Q{quarter}",
        "year": year,
        "quarter": quarter,
        "title": data["title"],
        "recipient_count": data["recipient_count"],
        "stats": data["stats"],
        "status": "발송 대기",
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "sent_at": None,
    }
    store.upsert("reports", record)
    return record


def receipt_targets(documents: list[dict], year: int | None = None) -> dict:
    """기부금영수증 발급 대상 집계(연말정산용)."""
    year = year or date.today().year
    targets: dict[str, dict] = {}

    for doc in documents:
        if not doc["donation"].get("receipt_required"):
            continue
        # 유산기부는 아직 돈이 들어오지 않았다. 영수증 대상에 넣으면 안 된다.
        if doc["donation"].get("type") == LEGACY_TYPE:
            continue
        donor_key = doc["donor"].get("id") or doc["donor"]["name"]
        amount = 0
        for inst in doc.get("installments", []):
            paid = _d(inst.get("paid_date"))
            if paid and paid.year == year:
                amount += inst["amount"]
        if doc["donation"]["frequency"] == "일시" and doc["status"] == "COMPLETED":
            s = _d(doc["derived"]["start_date"])
            if s and s.year == year:
                amount += doc["donation"]["amount"]
        if amount <= 0:
            continue
        row = targets.setdefault(donor_key, {
            "donor": doc["donor"]["name"],
            "email": doc["donor"].get("email"),
            "amount": 0,
        })
        row["amount"] += amount

    rows = sorted(targets.values(), key=lambda r: r["amount"], reverse=True)
    return {
        "year": year,
        "count": len(rows),
        "total_amount": sum(r["amount"] for r in rows),
        "rows": rows[:50],
        "status": "준비 중",
    }
