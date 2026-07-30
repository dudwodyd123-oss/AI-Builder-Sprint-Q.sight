"""W9 리포트 발행."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from ..services import donations
from ..services import report as svc
from ..services import risk

router = APIRouter(prefix="/api/reports", tags=["W9"])


class PublishRequest(BaseModel):
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


@router.post("/publish")
async def publish(body: PublishRequest):
    docs = await donations.load_documents()
    record = svc.publish(docs, body.year, body.quarter)
    return {
        "report": record,
        "message": f"{record['title']}를 수신자 {record['recipient_count']}명에게 발행했습니다.",
    }
