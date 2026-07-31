"""W9 리포트 발행.

분기 후원 리포트 초안을 집계로 만들고, 발행 이력과 기부금영수증 대상을 관리한다.
정적 템플릿 + 약정 집계 조합이라 별도 외부 API가 필요 없다.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from .. import config, store
from .donations import _d

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
        donor_key = doc["donor"].get("id") or doc["donor"]["name"]
        program = doc["donation"].get("program_name", "미지정")

        # 분기 안에 실제로 들어온 회차 금액
        for inst in doc.get("installments", []):
            paid = _d(inst.get("paid_date"))
            if paid and start <= paid < end:
                total_amount += inst["amount"]
                by_program[program] += inst["amount"]
                donors.add(donor_key)

        # 일시 기부는 약정 시작일 기준
        if doc["donation"]["frequency"] == "일시" and doc["status"] == "COMPLETED":
            s = _d(doc["derived"]["start_date"])
            if s and start <= s < end:
                total_amount += doc["donation"]["amount"]
                by_program[program] += doc["donation"]["amount"]
                donors.add(donor_key)

        # 이 분기에 약정이 완료(만기 이행)된 건
        e = _d(doc["derived"]["end_date"])
        if e and start <= e < end and doc["status"] in ("COMPLETED", "EXPIRED"):
            completed += 1

    return {
        "year": year,
        "quarter": quarter,
        "title": f"{year}년 {quarter}분기 후원 리포트",
        "subtitle": "기부자에게 보내는 이행 보고 · 전체 사업 요약",
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
    return sorted(rows, key=lambda r: (r.get("year", 0), r.get("quarter", 0)), reverse=True)


def publish(documents: list[dict], year: int, quarter: int) -> dict:
    """리포트를 발행 처리하고 이력에 남긴다.

    실제 발송(이메일/알림톡)은 기관 채널 연동 대상이라 여기서는
    수신자 수와 발행 시각만 기록한다.
    """
    data = draft(documents, year, quarter)
    record = {
        "id": f"rpt_{year}Q{quarter}",
        "year": year,
        "quarter": quarter,
        "title": data["title"],
        "recipient_count": data["recipient_count"],
        "stats": data["stats"],
        "status": "발행 완료",
        "published_at": datetime.now().isoformat(timespec="seconds"),
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
