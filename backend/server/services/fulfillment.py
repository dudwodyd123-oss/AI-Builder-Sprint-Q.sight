"""W8 이행 관리 · 증빙 매칭.

업로드한 증빙(영수증·이체확인서)을 Document Parse로 읽고, 금액·날짜를
Information Extract로 뽑아 회차에 자동으로 붙인다.
매칭에 실패하면 후보를 돌려주고 담당자가 직접 고르게 한다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from .. import store
from ..clients import upstage
from .donations import _d

# 자동 매칭 허용 오차
AMOUNT_TOLERANCE = 0.05      # 금액 5% 이내
DATE_WINDOW_DAYS = 20        # 예정일 ±20일

# W8 목록에 그룹별로 담을 최대 행 수
MAX_OVERDUE = 30
MAX_WAITING = 20
MAX_DONE = 25

# 자동 매칭이 실패했을 때 담당자가 직접 고르도록 내려보내는 회차 수 상한
MAX_MANUAL_OPTIONS = 100

PROOF_SCHEMA = {
    "type": "object",
    "properties": {
        "amount": {"type": ["integer", "null"], "description": "입금/기부 금액(원). 숫자만."},
        "paid_date": {"type": ["string", "null"], "description": "입금일 YYYY-MM-DD"},
        "payer_name": {"type": ["string", "null"], "description": "입금자명"},
        "document_kind": {"type": ["string", "null"], "description": "영수증 / 이체확인서 / 기타"},
    },
    "required": ["amount", "paid_date", "payer_name", "document_kind"],
    "additionalProperties": False,
}


def summary(documents: list[dict], today: date | None = None) -> dict:
    """상단 KPI 3종: 이번 달 예정 · 확인 완료 · 지연."""
    today = today or date.today()
    month_start = today.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)

    scheduled = confirmed = auto_matched = delayed = 0
    longest_delay = 0

    for doc in documents:
        for inst in doc.get("installments", []):
            due = _d(inst["due_date"])
            if not due:
                continue
            if month_start <= due < next_month:
                scheduled += 1
            if inst.get("paid_date"):
                paid = _d(inst["paid_date"])
                if paid and month_start <= paid < next_month:
                    confirmed += 1
                    if inst.get("matched_by") != "manual":
                        auto_matched += 1
            elif due < today and doc["derived"]["is_active"]:
                # 이미 끝난 약정의 옛 미이행은 지연으로 세지 않는다.
                delayed += 1
                longest_delay = max(longest_delay, (today - due).days)

    return {
        "month": f"{today.year:04d}-{today.month:02d}",
        "scheduled": scheduled,
        "confirmed": confirmed,
        "auto_matched": auto_matched,
        "delayed": delayed,
        "longest_delay_days": longest_delay,
    }


def _installment_status(inst: dict, today: date) -> tuple[str, str]:
    """회차 하나의 표시 상태. 목록·드릴다운이 같은 기준을 쓰도록 한 곳에 둔다."""
    if inst.get("paid_date"):
        if inst.get("status") == "지연 완료":
            return "지연 완료", "warning"
        return ("자동 매칭" if inst.get("matched_by") != "manual" else "확인 완료"), "success"

    due = _d(inst["due_date"])
    if due and due < today:
        return f"지연 {(today - due).days}일", "error"
    return "대기", "muted"


def _tracked(documents: list[dict]) -> list[dict]:
    """이행을 따라가야 하는 약정만. 해지·만료된 건 제외한다."""
    return [d for d in documents
            if d["derived"]["is_active"] or d["status"] == "EXPIRED"]


def program_cards(documents: list[dict], programs: list[dict],
                  today: date | None = None) -> list[dict]:
    """이행 관리 첫 화면 — 모금 사업별 현황 카드.

    지연 건수를 카드에 함께 담는다. 사업을 하나씩 열어보지 않고도
    어디에 문제가 있는지 보이게 하려는 것이다.
    """
    today = today or date.today()
    month_start = today.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)

    stat: dict[str, dict] = {}
    for doc in _tracked(documents):
        pid = doc["donation"].get("program_id") or "_none"
        s = stat.setdefault(pid, {
            "donors": set(), "scheduled": 0, "confirmed": 0,
            "overdue": 0, "longest_delay": 0, "waiting": 0,
        })
        s["donors"].add(doc["id"])
        for inst in doc.get("installments", []):
            due = _d(inst["due_date"])
            if not due:
                continue
            if month_start <= due < next_month:
                s["scheduled"] += 1
            if inst.get("paid_date"):
                paid = _d(inst["paid_date"])
                if paid and month_start <= paid < next_month:
                    s["confirmed"] += 1
            elif due < today:
                s["overdue"] += 1
                s["longest_delay"] = max(s["longest_delay"], (today - due).days)
            elif due <= today + timedelta(days=45):
                s["waiting"] += 1

    by_id = {p["id"]: p for p in programs}
    cards = []
    for pid, s in stat.items():
        program = by_id.get(pid, {})
        cards.append({
            "program_id": pid,
            "name": program.get("name") or "사업 미지정",
            "archived": program.get("status") == "archived",
            "donor_count": len(s["donors"]),
            "scheduled": s["scheduled"],
            "confirmed": s["confirmed"],
            "overdue": s["overdue"],
            "waiting": s["waiting"],
            "longest_delay_days": s["longest_delay"],
        })
    # 지연이 많은 사업이 먼저. 손댈 곳부터 보이게 한다.
    cards.sort(key=lambda c: (-c["overdue"], -c["scheduled"], c["name"]))
    return cards


def program_donors(documents: list[dict], program_id: str,
                   today: date | None = None) -> list[dict]:
    """한 사업에 참여한 기부자(약정) 목록."""
    today = today or date.today()
    out = []
    for doc in _tracked(documents):
        if (doc["donation"].get("program_id") or "_none") != program_id:
            continue
        installments = doc.get("installments", [])
        overdue = [i for i in installments
                   if not i.get("paid_date") and (_d(i["due_date"]) or today) < today]
        paid = [i for i in installments if i.get("paid_date")]
        upcoming = sorted(
            (i["due_date"] for i in installments
             if not i.get("paid_date") and (_d(i["due_date"]) or today) >= today))
        out.append({
            "document_id": doc["id"],
            "donor": doc["donor"]["name"],
            "type": doc["donation"]["type"],
            "amount": doc["donation"]["amount"],
            "frequency": doc["donation"]["frequency"],
            "installments_total": len(installments),
            "installments_paid": len(paid),
            "overdue": len(overdue),
            "longest_delay_days": max(
                ((today - (_d(i["due_date"]) or today)).days for i in overdue), default=0),
            "next_due": upcoming[0] if upcoming else None,
        })
    out.sort(key=lambda r: (-r["overdue"], r["donor"]))
    return out


def agreement_installments(documents: list[dict], document_id: str,
                           today: date | None = None) -> dict:
    """한 약정의 회차 전체. 드릴다운 마지막 단계."""
    today = today or date.today()
    doc = next((d for d in documents if d["id"] == document_id), None)
    if not doc:
        raise ValueError(f"약정을 찾을 수 없습니다: {document_id}")

    rows_ = []
    for inst in doc.get("installments", []):
        status, tone = _installment_status(inst, today)
        rows_.append({
            "no": inst["no"],
            "due_date": inst["due_date"],
            "paid_date": inst.get("paid_date"),
            "amount": inst["amount"],
            "proof_kind": inst.get("proof_kind") or ("영수증" if inst.get("proof_id") else None),
            "status": status,
            "tone": tone,
        })
    return {
        "document_id": doc["id"],
        "donor": doc["donor"]["name"],
        "program_id": doc["donation"].get("program_id"),
        "program_name": doc["donation"].get("program_name"),
        "type": doc["donation"]["type"],
        "amount": doc["donation"]["amount"],
        "frequency": doc["donation"]["frequency"],
        "rows": rows_,
    }


def overdue_rows(documents: list[dict], today: date | None = None) -> list[dict]:
    """지연된 회차만 사업을 가로질러 모아 본다.

    드릴다운만 있으면 월말에 "이번 달 밀린 것 전부"를 보려고 사업을
    하나씩 열어야 한다. 그 우회로를 없애려고 둔 화면이다.
    """
    today = today or date.today()
    out = []
    for doc in _tracked(documents):
        for inst in doc.get("installments", []):
            due = _d(inst["due_date"])
            if inst.get("paid_date") or not due or due >= today:
                continue
            out.append({
                "document_id": doc["id"],
                "donor": doc["donor"]["name"],
                "program_id": doc["donation"].get("program_id"),
                "program_name": doc["donation"].get("program_name"),
                "no": inst["no"],
                "due_date": inst["due_date"],
                "amount": inst["amount"],
                "delay_days": (today - due).days,
            })
    out.sort(key=lambda r: -r["delay_days"])
    return out


def rows(documents: list[dict], today: date | None = None) -> list[dict]:
    """회차 단위 이행 목록.

    한 덩어리로 잘라내면 어느 한 그룹이 통째로 사라지므로
    지연 / 대기 / 완료를 그룹별 상한으로 각각 담는다.
    """
    today = today or date.today()
    out = []
    for doc in documents:
        if not doc["derived"]["is_active"] and doc["status"] != "EXPIRED":
            continue
        for inst in doc.get("installments", []):
            due = _d(inst["due_date"])
            if not due or due > today + timedelta(days=45):
                continue
            if inst.get("paid_date"):
                status, tone = ("자동 매칭" if inst.get("matched_by") != "manual" else "확인 완료"), "success"
                if inst["status"] == "지연 완료":
                    status, tone = "지연 완료", "warning"
            elif due < today:
                status, tone = f"지연 {(today - due).days}일", "error"
            else:
                status, tone = "대기", "muted"

            out.append({
                "document_id": doc["id"],
                "donor": doc["donor"]["name"],
                "program_name": doc["donation"]["program_name"],
                "type": doc["donation"]["type"],
                "no": inst["no"],
                "label": f"{doc['donor']['name']} · {inst['no']}회차",
                "due_date": inst["due_date"],
                "paid_date": inst.get("paid_date"),
                "amount": inst["amount"],
                "proof_kind": inst.get("proof_kind") or ("영수증" if inst.get("proof_id") else None),
                "status": status,
                "tone": tone,
            })
    # 조치가 필요한 건(지연)이 맨 위, 다가오는 회차, 최근 처리 순.
    # "지연 완료"는 이미 처리된 건이라 완료 그룹으로 보낸다.
    overdue = sorted((r for r in out if not r["paid_date"] and r["tone"] == "error"),
                     key=lambda r: r["due_date"])
    waiting = sorted((r for r in out if not r["paid_date"] and r["tone"] != "error"),
                     key=lambda r: r["due_date"])
    done = sorted((r for r in out if r["paid_date"]), key=lambda r: r["paid_date"], reverse=True)
    return overdue[:MAX_OVERDUE] + waiting[:MAX_WAITING] + done[:MAX_DONE]


async def parse_proof(content: bytes, filename: str) -> dict:
    """증빙 파일에서 금액·날짜·입금자명을 뽑는다."""
    parsed = await upstage.document_parse(content, filename)
    text = parsed.get("text", "")

    extracted: dict = {}
    used_fallback = True
    if not parsed.get("fallback"):
        result = await upstage.extract(
            text,
            PROOF_SCHEMA,
            "기부금 입금 증빙에서 금액, 입금일, 입금자명, 문서 종류를 추출해줘.",
        )
        extracted = result.get("data") or {}
        used_fallback = result.get("fallback", False)

    # 규칙 기반 값으로 빈 칸을 메운다(키가 없을 때도 흐름 확인 가능).
    if not extracted.get("amount"):
        extracted["amount"] = upstage.guess_amount(text)
    if not extracted.get("paid_date"):
        extracted["paid_date"] = upstage.guess_date(text)

    return {
        "filename": filename,
        "text_preview": text[:600],
        "extracted": extracted,
        "fallback": used_fallback,
    }


def match(documents: list[dict], extracted: dict, document_id: str | None = None) -> dict:
    """추출한 금액·날짜로 회차를 찾는다.

    반환: {"matched": row|None, "candidates": [row, ...]}
    금액과 날짜가 모두 허용 범위 안이고 후보가 하나면 자동 매칭으로 본다.
    """
    amount = extracted.get("amount")
    paid_date = _d(extracted.get("paid_date"))
    payer = (extracted.get("payer_name") or "").strip()

    candidates = []
    for doc in documents:
        if document_id and doc["id"] != document_id:
            continue
        if payer and not document_id and payer not in doc["donor"]["name"]:
            continue
        for inst in doc.get("installments", []):
            if inst.get("paid_date"):
                continue
            due = _d(inst["due_date"])
            if not due:
                continue
            score = 0.0
            if amount and inst["amount"]:
                diff = abs(inst["amount"] - amount) / inst["amount"]
                if diff > AMOUNT_TOLERANCE:
                    continue
                score += 1 - diff
            if paid_date:
                gap = abs((paid_date - due).days)
                if gap > DATE_WINDOW_DAYS:
                    continue
                score += 1 - gap / DATE_WINDOW_DAYS
            candidates.append({
                "document_id": doc["id"],
                "donor": doc["donor"]["name"],
                "no": inst["no"],
                "due_date": inst["due_date"],
                "amount": inst["amount"],
                "score": round(score, 3),
            })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    matched = candidates[0] if len(candidates) == 1 or (
        candidates and len(candidates) > 1 and candidates[0]["score"] - candidates[1]["score"] > 0.3
    ) else None
    return {"matched": matched, "candidates": candidates[:5]}


def open_installments(documents: list[dict], today: date | None = None) -> list[dict]:
    """아직 이행되지 않은 회차 전부.

    금액·날짜가 맞는 후보를 찾지 못했을 때, 담당자가 목록에서 직접 고를 수 있게
    내려보낸다. 지연된 회차가 먼저 오도록 예정일 순으로 정렬한다.
    """
    today = today or date.today()
    out = []
    for doc in documents:
        if not doc["derived"]["is_active"] and doc["status"] != "EXPIRED":
            continue
        for inst in doc.get("installments", []):
            if inst.get("paid_date"):
                continue
            due = _d(inst["due_date"])
            if not due:
                continue
            out.append({
                "document_id": doc["id"],
                "donor": doc["donor"]["name"],
                "program_name": doc["donation"].get("program_name"),
                "no": inst["no"],
                "due_date": inst["due_date"],
                "amount": inst["amount"],
                "status": f"지연 {(today - due).days}일" if due < today else "대기",
            })
    out.sort(key=lambda r: (r["due_date"], r["donor"], r["no"]))
    return out[:MAX_MANUAL_OPTIONS]


def confirm(documents: list[dict], document_id: str, no: int, paid_date: str,
            proof: dict, matched_by: str = "auto") -> dict:
    """회차를 이행 완료로 기록한다. 결과는 data/fulfillment.json에 남는다."""
    doc = next((d for d in documents if d["id"] == document_id), None)
    if not doc:
        raise ValueError(f"약정 문서를 찾을 수 없습니다: {document_id}")

    installments = [dict(i) for i in doc.get("installments", [])]
    target = next((i for i in installments if i["no"] == no), None)
    if not target:
        raise ValueError(f"{no}회차를 찾을 수 없습니다.")

    due = _d(target["due_date"])
    paid = _d(paid_date) or date.today()

    # 증빙에서 뽑은 날짜가 엉뚱할 수 있다(영수증 이미지의 다른 날짜를 읽는 경우).
    # 약정이 시작되기도 전의 이행은 성립하지 않으므로 막는다. 이걸 그대로 받으면
    # "이번 달 실제 수입" 같은 집계가 조용히 틀어진다.
    start = _d(doc["derived"].get("start_date"))
    if start and paid < start:
        raise ValueError(
            f"이행일({paid.isoformat()})이 약정 시작일({start.isoformat()})보다 앞섭니다. "
            "증빙에서 읽은 날짜가 맞는지 확인해주세요."
        )
    if paid > date.today():
        raise ValueError(f"이행일({paid.isoformat()})이 미래입니다. 날짜를 확인해주세요.")

    target["paid_date"] = paid.isoformat()
    target["status"] = "완료" if due and (paid - due).days <= 5 else "지연 완료"
    target["proof_id"] = proof.get("proof_id") or f"prf_{document_id}_{no}"
    target["proof_kind"] = proof.get("document_kind") or "영수증"
    target["matched_by"] = matched_by
    target["confirmed_at"] = datetime.now().isoformat(timespec="seconds")

    store.upsert(
        "fulfillment",
        {"id": document_id, "document_id": document_id, "installments": installments},
    )
    return target
