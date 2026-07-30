"""약정 문서 로딩 + 파생 필드 계산.

모두싸인이 가진 것(문서·서명 상태·이력)과 기관이 가진 것(회차별 이행, 증빙)을
여기서 한 번 합쳐 두고, W1~W4·W8·W9가 모두 이 결과를 재사용한다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from .. import store
from ..clients.modusign import STATUS_LABELS, client

# 이행 지연으로 볼 유예 기간(일)
GRACE_DAYS = 5


def _d(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def months_between(start: date, end: date) -> float:
    return (end.year - start.year) * 12 + (end.month - start.month) + (end.day - start.day) / 30.0


async def load_documents() -> list[dict]:
    """모두싸인 문서 + 로컬 이행 데이터를 병합하고 파생 필드를 붙인다."""
    documents = await client.list_documents()

    # 로컬에서 기록한 회차 이행/증빙을 문서에 덮어쓴다.
    local = {row["document_id"]: row for row in store.read_list("fulfillment")}
    today = date.today()

    enriched = []
    for doc in documents:
        doc = dict(doc)
        patch = local.get(doc["id"])
        if patch and patch.get("installments"):
            doc["installments"] = patch["installments"]
        enriched.append(_derive(doc, today))
    return enriched


def _derive(doc: dict, today: date) -> dict:
    donation = doc.get("donation", {})
    start = _d(donation.get("start_date")) or _d(doc.get("requested_at")) or today
    end = _d(donation.get("end_date"))
    installments = doc.get("installments") or []

    due = [i for i in installments if _d(i["due_date"]) and _d(i["due_date"]) <= today]
    paid = [i for i in due if i.get("paid_date")]
    on_time = [i for i in paid if i.get("status") == "완료"]
    upcoming = [i for i in installments if _d(i["due_date"]) and _d(i["due_date"]) > today]

    # 미이행 중 가장 오래된 건 기준으로 지연 일수를 계산한다.
    overdue = [i for i in due if not i.get("paid_date")]
    delay_days = 0
    if overdue:
        oldest = min(_d(i["due_date"]) for i in overdue)
        delay_days = max(0, (today - oldest).days)

    # 연속 미이행 회차 수 (최근 회차부터 거꾸로)
    consecutive_missed = 0
    for i in reversed(due):
        if i.get("paid_date"):
            break
        consecutive_missed += 1

    is_signed = doc.get("status") == "COMPLETED"
    is_expired = doc.get("status") == "EXPIRED" or bool(end and end < today and is_signed)
    is_active = is_signed and not is_expired

    if doc.get("status") == "ON_GOING":
        board_status, tone = "서명 대기", "muted"
    elif doc.get("status") == "REJECTED":
        board_status, tone = "서명 거절", "error"
    elif doc.get("status") == "CANCELED":
        board_status, tone = "취소됨", "muted"
    elif is_expired:
        board_status, tone = "기한 만료", "muted"
    elif delay_days > GRACE_DAYS:
        board_status, tone = f"지연 {delay_days}일", "warning"
    else:
        board_status, tone = "정상", "success"

    doc["derived"] = {
        "status_label": STATUS_LABELS.get(doc.get("status", ""), doc.get("status", "")),
        "board_status": board_status,
        "tone": tone,
        "is_active": is_active,
        "is_expired": is_expired,
        "is_pending_signature": doc.get("status") == "ON_GOING",
        "start_date": start.isoformat(),
        "end_date": end.isoformat() if end else None,
        "days_to_expiry": (end - today).days if end else None,
        "duration_months": round(months_between(start, min(end or today, today) if is_expired else today), 1),
        "installments_total": len(installments),
        "installments_due": len(due),
        "installments_paid": len(paid),
        "installments_on_time": len(on_time),
        "fulfillment_rate": round(len(paid) / len(due) * 100) if due else None,
        "delay_days": delay_days,
        "consecutive_missed": consecutive_missed,
        "next_due_date": min((i["due_date"] for i in upcoming), default=None),
        "monthly_value": _monthly_value(donation),
        "viewed_not_signed_days": _viewed_not_signed_days(doc, today),
        "has_amendment": bool(doc.get("amendment")),
    }
    return doc


def _monthly_value(donation: dict) -> int:
    """월 환산 금액. 정기 기부의 예상 수입 계산에 쓴다."""
    amount = donation.get("amount") or 0
    freq = donation.get("frequency")
    if freq == "월":
        return amount
    if freq == "연":
        return round(amount / 12)
    return 0


def _viewed_not_signed_days(doc: dict, today: date) -> int | None:
    """열람은 했지만 서명하지 않은 채 지난 일수."""
    if doc.get("status") != "ON_GOING":
        return None
    viewed = [_d(p.get("viewed_at")) for p in doc.get("participants", []) if p.get("viewed_at")]
    viewed = [v for v in viewed if v]
    if not viewed:
        return None
    return (today - max(viewed)).days


# ── 화면용 축약 행 ──────────────────────────────────────────
def to_row(doc: dict) -> dict:
    """W2 기부 현황 테이블 한 줄."""
    d = doc["derived"]
    return {
        "id": doc["id"],
        "donor": doc["donor"]["masked_name"],
        "donor_full": doc["donor"]["name"],
        "title": doc["title"],
        "type": doc["donation"]["type"],
        "amount": doc["donation"]["amount"],
        "frequency": doc["donation"]["frequency"],
        "program_name": doc["donation"]["program_name"],
        "next_due": d["next_due_date"],
        "status": d["board_status"],
        "tone": d["tone"],
        "is_pending_signature": d["is_pending_signature"],
        "last_reminded_at": doc.get("last_reminded_at"),
        "requested_at": doc["requested_at"],
    }


def recent_reminder_note(documents: list[dict]) -> str | None:
    """가장 최근 리마인드 발송 시각 안내 문구."""
    stamps = [d.get("last_reminded_at") for d in documents if d.get("last_reminded_at")]
    if not stamps:
        return None
    latest = max(stamps)
    try:
        dt = datetime.fromisoformat(latest)
    except ValueError:
        return None
    return f"최근 리마인드 발송: {dt.strftime('%m-%d %H:%M')}"


def within(d: str | None, days: int, today: date | None = None) -> bool:
    today = today or date.today()
    parsed = _d(d)
    return bool(parsed and today <= parsed <= today + timedelta(days=days))
