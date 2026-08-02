"""W9 후원 리포트.

발송 채널이 아직 없어서 초안 숫자를 만들고 이력에 남기는 데까지만 한다.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..services import donations
from ..services import report as svc
from ..services import risk

router = APIRouter(prefix="/api/reports", tags=["W9"])


class DraftRequest(BaseModel):
    year: int
    quarter: int


@router.get("")
async def get_reports(year: int | None = None, quarter: int | None = None):
    docs = await donations.load_documents()
    return {
        "draft": svc.draft(docs, year, quarter),
        "history": svc.history(),
        "receipts": svc.receipt_targets(docs),
        "renewal_candidates": risk.renewal_candidates(docs),
    }


@router.post("/draft")
async def save_draft(body: DraftRequest):
    """초안을 이력에 남긴다. ⚠️ 발송하지 않는다."""
    docs = await donations.load_documents()
    record = svc.save_draft(docs, body.year, body.quarter)
    return {
        "report": record,
        "message": f"{record['title']} 초안을 만들었습니다. "
                   f"수신 대상 {record['recipient_count']}명 · 발송은 아직 연결되지 않았습니다.",
    }
