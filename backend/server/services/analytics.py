"""W1 대시보드 집계.

KPI 4종 · 월별 신규 약정 · 기부 유형 분포 · 향후 6개월 예상 수입 · 사업별 달성률.
모두 services/donations.load_documents()의 결과 하나만 가지고 계산한다.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from .donations import _d, months_between

TYPE_ORDER = ["정기", "일시", "봉사", "유산"]


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _shift(d: date, months: int) -> date:
    y, m = d.year, d.month + months
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    return date(y, m, 1)


def build(documents: list[dict], programs: list[dict], today: date | None = None) -> dict:
    today = today or date.today()
    active = [d for d in documents if d["derived"]["is_active"]]

    return {
        "as_of": _month_key(today),
        "kpis": _kpis(documents, active, today),
        "monthly_new": _monthly_new(documents, today),
        "type_mix": _type_mix(active),
        "forecast": _forecast(active, today),
        "program_progress": _program_progress(documents, programs),
    }


# ── KPI 4종 ────────────────────────────────────────────────
def _kpis(documents: list[dict], active: list[dict], today: date) -> list[dict]:
    # 1) 진행 중 약정 — 지난달 말 기준과 비교
    last_month_end = _shift(today.replace(day=1), 0)
    prev_active = [
        d for d in documents
        if d["derived"]["is_active"] or (
            d["derived"]["is_expired"] and (_d(d["derived"]["end_date"]) or today) >= last_month_end
        )
    ]
    started_this_month = [d for d in active if (_d(d["derived"]["start_date"]) or today) >= last_month_end]
    delta = len(started_this_month)

    # 2) 이번 달 예상 수입 — 정기 월 환산 + 이번 달 예정된 일시/유산
    expected = sum(d["derived"]["monthly_value"] for d in active)
    for d in active:
        if d["donation"]["frequency"] in ("일시",):
            start = _d(d["derived"]["start_date"])
            if start and _month_key(start) == _month_key(today):
                expected += d["donation"]["amount"]

    # 3) 이행률 — 도래한 회차 대비 이행 회차
    due = sum(d["derived"]["installments_due"] for d in documents)
    paid = sum(d["derived"]["installments_paid"] for d in documents)
    rate = round(paid / due * 100) if due else 0

    prev_due = prev_paid = 0
    for d in documents:
        for inst in d.get("installments", []):
            due_date = _d(inst["due_date"])
            if due_date and due_date < last_month_end:
                prev_due += 1
                if inst.get("paid_date"):
                    prev_paid += 1
    prev_rate = round(prev_paid / prev_due * 100) if prev_due else rate

    # 4) 평균 지속 개월 — 체결된 약정의 유지 기간 평균
    durations = [
        months_between(_d(d["derived"]["start_date"]) or today, _d(d["derived"]["end_date"]) or today)
        for d in documents
        if d["status"] in ("COMPLETED", "EXPIRED")
    ]
    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0.0

    return [
        {
            "key": "active_agreements",
            "label": "진행 중 약정",
            "value": len(active),
            "unit": "건",
            "delta": f"+{delta}" if delta >= 0 else str(delta),
            "delta_tone": "up" if delta >= 0 else "down",
            "note": "이번 달 신규",
        },
        {
            "key": "expected_income",
            "label": "이번 달 예상",
            "value": round(expected / 1000),
            "unit": "천원",
            "delta": None,
            "note": "약정 기준",
        },
        {
            "key": "fulfillment_rate",
            "label": "이행률",
            "value": rate,
            "unit": "%",
            "delta": f"{rate - prev_rate:+d}%p",
            "delta_tone": "up" if rate >= prev_rate else "down",
            "note": "전월 대비",
        },
        {
            "key": "avg_duration",
            "label": "평균 지속",
            "value": avg_duration,
            "unit": "개월",
            "delta": None,
            "note": "해지 포함",
        },
    ]


# ── 월별 신규 약정 ──────────────────────────────────────────
def _monthly_new(documents: list[dict], today: date, months: int = 6) -> list[dict]:
    buckets: dict[str, int] = {}
    for i in range(months - 1, -1, -1):
        buckets[_month_key(_shift(today.replace(day=1), -i))] = 0
    for d in documents:
        if d["status"] not in ("COMPLETED", "EXPIRED"):
            continue
        start = _d(d["derived"]["start_date"])
        if start and _month_key(start) in buckets:
            buckets[_month_key(start)] += 1
    return [{"month": k, "label": f"{int(k[5:])}월", "count": v} for k, v in buckets.items()]


# ── 기부 유형 분포 ──────────────────────────────────────────
def _type_mix(active: list[dict]) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    amounts: dict[str, int] = defaultdict(int)
    for d in active:
        t = d["donation"]["type"]
        counts[t] += 1
        amounts[t] += d["donation"]["amount"]
    total = sum(counts.values()) or 1
    return [
        {
            "type": t,
            "count": counts.get(t, 0),
            "amount": amounts.get(t, 0),
            "ratio": round(counts.get(t, 0) / total * 100),
        }
        for t in TYPE_ORDER
        if counts.get(t)
    ]


# ── 향후 6개월 예상 수입 ────────────────────────────────────
def _forecast(active: list[dict], today: date, months: int = 6) -> dict:
    """만료 예정 약정을 반영해 월별 예상 수입이 어디서 꺾이는지 보여준다."""
    series = []
    expiring_total = 0
    base_month = today.replace(day=1)

    for i in range(months):
        month = _shift(base_month, i)
        month_end = _shift(month, 1)
        total = 0
        expiring = 0
        for d in active:
            end = _d(d["derived"]["end_date"])
            if end and end < month:
                continue  # 이미 만료된 약정
            total += d["derived"]["monthly_value"]
            if end and month <= end < month_end:
                expiring += 1
        expiring_total += expiring
        series.append({
            "month": _month_key(month),
            "label": f"{month.month}월",
            "amount": total,
            "expiring": expiring,
        })

    first = series[0]["amount"]
    lowest = min(series, key=lambda s: s["amount"])

    # 이번 달 예상 수입이 0이면 증감률을 낼 수 없다.
    # (약정이 아직 없는 기관에서 -100% 같은 엉뚱한 값이 뜨는 것을 막는다)
    if not first:
        return {
            "series": series,
            "expiring_count": expiring_total,
            "lowest_month_label": lowest["label"],
            "drop_pct": None,
            "headline": "예상 수입을 계산할 약정이 아직 없습니다",
        }

    drop_pct = round((lowest["amount"] - first) / first * 100)
    return {
        "series": series,
        "expiring_count": expiring_total,
        "lowest_month_label": lowest["label"],
        "drop_pct": drop_pct,
        "headline": f"{lowest['label']} {drop_pct}% · 만료 예정 {expiring_total}건",
    }


# ── 사업별 달성률 ──────────────────────────────────────────
def _program_progress(documents: list[dict], programs: list[dict]) -> list[dict]:
    raised: dict[str, int] = defaultdict(int)
    pledged: dict[str, int] = defaultdict(int)
    donors: dict[str, set] = defaultdict(set)

    for d in documents:
        pid = d["donation"].get("program_id")
        if not pid or d["status"] not in ("COMPLETED", "EXPIRED"):
            continue
        donors[pid].add(d["donor"].get("id") or d["donor"]["name"])
        if d["donation"]["frequency"] == "일시":
            raised[pid] += d["donation"]["amount"]
            pledged[pid] += d["donation"]["amount"]
        else:
            raised[pid] += sum(i["amount"] for i in d.get("installments", []) if i.get("paid_date"))
            pledged[pid] += d["donation"]["amount"] * max(1, d["derived"]["installments_total"])

    rows = []
    for p in programs:
        goal = p.get("goal_amount") or 0
        got = raised.get(p["id"], 0)
        rows.append({
            "id": p["id"],
            "name": p["name"],
            "goal_amount": goal,
            "raised_amount": got,
            "pledged_amount": pledged.get(p["id"], 0),
            "donor_count": len(donors.get(p["id"], set())),
            "rate": round(got / goal * 100) if goal else 0,
        })
    return sorted(rows, key=lambda r: r["rate"], reverse=True)
