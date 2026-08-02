"""유산기부 관리 — 등록 건수 조회, 사후 수령 기록, 철회 표시."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import donations
from ..services import legacy as svc

router = APIRouter(prefix="/api/legacy", tags=["유산기부"])


class ReceiptRequest(BaseModel):
    amount: int
    received_date: str | None = None
    receipt_no: str = ""
    note: str = ""


class RevokeRequest(BaseModel):
    revoked: bool = True
    reason: str = ""


@router.get("")
async def list_legacy():
    """유산 약정 목록 + 건수 요약 + 중복 의심."""
    docs = await donations.load_documents()
    return svc.build(docs)


@router.post("/{document_id}/receipt")
async def record_receipt(document_id: str, body: ReceiptRequest):
    """기부자 사망 후 실제로 들어온 금액을 기록한다."""
    docs = await donations.load_documents()
    _require(docs, document_id)
    try:
        row = svc.record_receipt(document_id, body.amount, body.received_date,
                                 body.receipt_no, body.note)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"receipt": row, "message": "수령 내역을 기록했습니다."}


@router.post("/{document_id}/revoke")
async def set_revoked(document_id: str, body: RevokeRequest):
    """철회 표시를 켜거나 끈다."""
    docs = await donations.load_documents()
    _require(docs, document_id)
    row = svc.set_revoked(document_id, body.revoked, body.reason)
    return {
        "receipt": row,
        "message": "철회로 표시했습니다." if body.revoked else "철회 표시를 해제했습니다.",
    }


def _require(documents: list[dict], document_id: str) -> dict:
    doc = next((d for d in documents if d["id"] == document_id), None)
    if not doc:
        raise HTTPException(404, "약정 문서를 찾을 수 없습니다.")
    if doc.get("donation", {}).get("type") != svc.LEGACY_TYPE:
        raise HTTPException(400, "유산기부 약정이 아닙니다.")
    return doc
