"""약정 문서 로딩 + 파생 필드 계산.

모두싸인이 가진 것(문서·서명 상태·이력)과 기관이 가진 것(회차별 이행, 증빙)을
여기서 한 번 합쳐 두고, W1~W4·W8·W9가 모두 이 결과를 재사용한다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from .. import store
from ..clients.modusign import STATUS_LABELS, client
from . import agreements as agreements_svc

# 지연 판정에 유예를 두지 않는다.
# 예전에는 5일 유예가 있었는데, 이행 관리(W8)는 예정일 다음 날부터 "지연 N일"로
# 표시해서 같은 약정이 기부 현황에서는 "정상"으로 보였다. 화면마다 답이 다르면
# 담당자가 어느 쪽을 믿어야 할지 알 수 없다. W8과 같은 기준으로 맞춘다.

# 납부 주기별 회차 간격(개월). 여기 없는 주기(일시·유산)는 회차 이행이 없다.
SCHEDULE_STEPS = {"월": 1, "회": 3, "연": 12}
# 예정표가 끝없이 길어지지 않도록 둔 상한
MAX_SCHEDULE = 60


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
    # 개인용 웹이 알려온 유산기부 녹음 완료 사실. 여기서 한 번 합쳐 두면
    # W2·W3·W4가 모두 같은 값을 본다.
    recordings = agreements_svc.recordings_by_document()
    today = date.today()

    enriched = []
    for doc in documents:
        doc = dict(doc)
        patch = local.get(doc["id"])
        if patch and patch.get("installments"):
            doc["installments"] = patch["installments"]
        elif not doc.get("installments"):
            doc["installments"] = _schedule(doc, today)
        doc["legacy_recording"] = recordings.get(doc["id"])
        enriched.append(_derive(doc, today))
    return enriched


def _add_months(d: date, months: int) -> date:
    y, m = d.year, d.month + months
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
    last = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(d.day, last))


def _schedule(doc: dict, today: date) -> list[dict]:
    """약정 조건으로 예정 회차표를 만든다.

    모두싸인에는 회차 개념이 없다. 체결된 정기·봉사 약정은 납부 주기와 기간으로
    예정표를 직접 세워야 W8에서 증빙을 붙일 회차가 생긴다. 이행 기록은 담당자가
    확인할 때 store에 쌓이고, 그때부터는 저장된 쪽이 이 예정표를 대신한다.
    """
    if doc.get("status") not in ("COMPLETED", "EXPIRED"):
        return []
    donation = doc.get("donation", {})
    step = SCHEDULE_STEPS.get(donation.get("frequency"))
    start = _d(donation.get("start_date")) or _d(doc.get("requested_at"))
    if not step or not start:
        return []

    end = _d(donation.get("end_date"))
    months = int(donation.get("term_months") or 0)
    if not months and end:
        months = max(1, round(months_between(start, end)))
    total = min(MAX_SCHEDULE, max(1, (months or 12) // step))

    rows = []
    for i in range(total):
        due = _add_months(start, i * step)
        rows.append({
            "no": i + 1,
            "due_date": due.isoformat(),
            "paid_date": None,
            "amount": donation.get("amount") or 0,
            "proof_id": None,
            "status": "대기" if due > today else "미이행",
        })
    return rows


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

    # 유산 약정은 서명만 한 것과 녹음유언까지 마친 것이 법적으로 다르다.
    # 녹음이 있어야 민법 제1067조 요건을 논할 수 있고, 서명만이면 기부 의사 표시일 뿐이다.
    # 서명 후 며칠째 녹음이 없는지 세어 두면 담당자가 연락해 도울 수 있다.
    recording = doc.get("legacy_recording") or None
    is_legacy = donation.get("type") == "유산"
    days_without_recording = None
    if is_legacy and is_signed and not recording:
        signed_on = _d(doc.get("completed_at")) or start
        days_without_recording = max(0, (today - signed_on).days) if signed_on else None
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
    elif delay_days > 0:
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
        "is_legacy": is_legacy,
        "recording_status": (recording or {}).get("status"),
        "days_without_recording": days_without_recording,
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
        "donor": doc["donor"]["name"],
        "title": doc["title"],
        "type": doc["donation"]["type"],
        "amount": doc["donation"]["amount"],
        "frequency": doc["donation"]["frequency"],
        "program_id": doc["donation"].get("program_id"),
        "program_name": doc["donation"]["program_name"],
        "next_due": d["next_due_date"],
        "status": d["board_status"],
        "tone": d["tone"],
        "is_pending_signature": d["is_pending_signature"],
        # 유산 약정만 의미가 있다. 서명만 한 사람과 녹음까지 마친 사람을 목록에서 가른다.
        "is_legacy": d["is_legacy"],
        "recording_status": d["recording_status"],
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
