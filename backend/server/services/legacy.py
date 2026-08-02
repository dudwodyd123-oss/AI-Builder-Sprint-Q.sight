"""유산기부 관리 — 등록 건수 집계와 사후 수령 기록.

유산기부는 다른 기부와 성격이 다르다.

- 금액이 없다. 모두싸인 metadatas에 amount가 비고 donation_type만 "유산"으로 온다.
  실제 금액은 기부자 사망 후에야 정해지므로, 그때까지는 **건수만 센다.**
- "무엇을 얼마나 남길지"는 사람이 읽는 문장(bequest_detail)이다. 숫자가 아니다.
  비율·잔여재산 방식은 애초에 지금 금액을 매길 수 없어서 파싱해 쓰면 안 된다.
- 유언은 생전에 언제든 철회된다. 등록된 약정이 반드시 실현되지 않는다.

수령 기록은 약정 레코드를 고치지 않고 legacy_receipts에 따로 쌓는다.
개인용 웹이 약정 응답에서 자기가 쓰는 필드만 읽으므로 그쪽이 깨지지 않는다.

개인용 웹은 녹음유언까지 만들지만, **녹음 완료 사실은 여기로 오지 않는다.**
알릴 엔드포인트가 아직 없다. 그래서 등록된 건 중에는 서명만 하고 녹음을
마치지 않은 사람이 섞여 있다(법적으로는 완전히 다른 상태다).
"""

from __future__ import annotations

from datetime import date, datetime

from .. import store
from . import programs as program_svc

STORE = "legacy_receipts"

# 기부 유형 라벨. metadatas의 donation_type이 이 값이면 유산기부다.
LEGACY_TYPE = "유산"

REVOKED = "철회"
RECEIVED = "수령 완료"
REGISTERED = "등록 완료"
PENDING = "서명 대기"
REJECTED = "서명 거절"
CANCELED = "취소됨"

# 아직 살아 있는 약정으로 보는 상태. 중복 의심 판정과 등록 건수에 쓴다.
LIVE = (REGISTERED, RECEIVED)


def build(documents: list[dict]) -> dict:
    rows = list_pledges(documents)
    return {
        "rows": rows,
        "summary": _summary(rows),
        "duplicates": duplicate_groups(rows),
        "note": "유산기부는 사망 후에야 금액이 정해집니다. 그때까지는 건수만 셉니다.",
    }


def list_pledges(documents: list[dict]) -> list[dict]:
    """유산 약정 목록.

    모두싸인 문서(상태·기부자)에 로컬 약정 기록(values)과 수령 기록을 붙인다.
    values는 모두싸인 metadatas 10개 한도에 못 담는 항목들이라 로컬에만 있다.
    """
    by_doc = {r["document_id"]: r
              for r in store.read_list("agreements") if r.get("document_id")}
    receipts = {r["id"]: r for r in store.read_list(STORE)}
    archived = {p["id"] for p in program_svc.list_programs()
                if p.get("status") == program_svc.ARCHIVED}

    rows = []
    for doc in documents:
        if doc.get("donation", {}).get("type") != LEGACY_TYPE:
            continue
        values = (by_doc.get(doc["id"]) or {}).get("values") or {}
        receipt = receipts.get(doc["id"]) or {}
        program_id = doc["donation"].get("program_id")

        rows.append({
            "document_id": doc["id"],
            "donor": doc["donor"]["name"],
            "contact": doc["donor"].get("phone") or values.get("contact") or "",
            "email": doc["donor"].get("email"),
            "program_id": program_id,
            "program_name": doc["donation"].get("program_name"),
            # 사망 후 수령 기록은 몇 년 뒤 일이라 그때 사업은 보관돼 있을 가능성이 높다.
            # 목록에서 빼지 않고 표시만 한다.
            "program_archived": program_id in archived,
            # 사람이 읽는 문장이다. 금액으로 파싱하지 말 것.
            "bequest_type": values.get("bequest_type") or "",
            "bequest_detail": values.get("bequest_detail") or "",
            "purpose_note": values.get("purpose_note") or "",
            "condition": values.get("condition") or "",
            "executor": values.get("executor") or "",
            "doc_status": doc.get("status"),
            "requested_at": doc.get("requested_at"),
            "signed_at": doc.get("completed_at"),
            "received_amount": receipt.get("amount"),
            "received_date": receipt.get("received_date"),
            "receipt_no": receipt.get("receipt_no"),
            "revoked_at": receipt.get("revoked_at"),
            "revoke_reason": receipt.get("revoke_reason"),
            "note": receipt.get("note") or "",
            "status": _status(doc, receipt),
        })

    rows.sort(key=lambda r: r["requested_at"] or "", reverse=True)
    return rows


def _status(doc: dict, receipt: dict) -> str:
    if receipt.get("revoked_at"):
        return REVOKED
    if receipt.get("amount") is not None:
        return RECEIVED
    status = doc.get("status")
    if status == "REJECTED":
        return REJECTED
    if status == "CANCELED":
        return CANCELED
    if status == "ON_GOING":
        return PENDING
    return REGISTERED


def tone(status: str) -> str:
    return {
        RECEIVED: "success", REGISTERED: "teal", PENDING: "warning",
        REVOKED: "muted", REJECTED: "error", CANCELED: "muted",
    }.get(status, "muted")


def _summary(rows: list[dict]) -> dict:
    """건수 중심 요약.

    등록 건수는 **서명이 끝난 것만** 센다. 서명 요청만 보낸 상태는 아직
    기부 의사가 확정되지 않아서 실제와 어긋난다.
    """
    received = [r for r in rows if r["status"] == RECEIVED]
    return {
        "registered": sum(1 for r in rows if r["status"] in LIVE),
        "pending": sum(1 for r in rows if r["status"] == PENDING),
        "revoked": sum(1 for r in rows if r["status"] == REVOKED),
        "received_count": len(received),
        "received_amount": sum(r["received_amount"] or 0 for r in received),
        "donor_count": len({r["donor"] for r in rows if r["status"] in LIVE}),
    }


def duplicate_groups(rows: list[dict]) -> list[dict]:
    """같은 사람이 같은 사업에 살아 있는 유산 약정을 둘 이상 가진 경우.

    개인용 웹은 녹음을 다시 해도 약정을 새로 만들지 않는다. 다만 로그인이 없어
    브라우저를 바꾸거나 방문 기록을 지우면 이전 등록을 알아보지 못한다.
    그 경우만 중복이 생기므로 **막지 않고 담당자에게 알리기만 한다.**
    (다른 사업에 유산기부를 또 하는 것은 정상이라 사업까지 같아야 묶는다)
    """
    groups: dict[tuple, list[dict]] = {}
    for r in rows:
        if r["status"] not in LIVE:
            continue
        key = (r["donor"], _digits(r["contact"]), r["program_id"])
        groups.setdefault(key, []).append(r)

    return [
        {
            "donor": rows_[0]["donor"],
            "program_name": rows_[0]["program_name"],
            "count": len(rows_),
            "document_ids": [r["document_id"] for r in rows_],
        }
        for rows_ in groups.values() if len(rows_) > 1
    ]


def _digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


# ── 사후 처리 ──────────────────────────────────────────────
def record_receipt(document_id: str, amount: int, received_date: str | None,
                   receipt_no: str = "", note: str = "") -> dict:
    """실제로 들어온 금액을 기록한다(기부자 사망 후).

    약정 레코드는 건드리지 않는다. 모두싸인에 이미 서명된 문서가 있고,
    개인용 웹도 같은 레코드를 읽기 때문이다.
    """
    if amount is None or int(amount) <= 0:
        raise ValueError("수령 금액을 입력해주세요.")

    row = store.find(STORE, document_id) or {"id": document_id, "document_id": document_id}
    row.update({
        "amount": int(amount),
        "received_date": received_date or date.today().isoformat(),
        "receipt_no": receipt_no.strip(),
        "note": note.strip(),
        "recorded_at": datetime.now().isoformat(timespec="seconds"),
        # 수령했으면 철회가 아니다.
        "revoked_at": None,
        "revoke_reason": None,
    })
    return store.upsert(STORE, row)


def set_revoked(document_id: str, revoked: bool, reason: str = "") -> dict:
    """철회 표시. 유언은 생전에 언제든 철회할 수 있다.

    기부자의 권리라 실패가 아니다. 화면에서도 경고색으로 칠하지 않는다.
    """
    row = store.find(STORE, document_id) or {"id": document_id, "document_id": document_id}
    if revoked:
        row["revoked_at"] = datetime.now().isoformat(timespec="seconds")
        row["revoke_reason"] = reason.strip()
    else:
        row["revoked_at"] = None
        row["revoke_reason"] = None
    return store.upsert(STORE, row)
