"""W8 이행 관리 · 증빙 매칭."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..clients import upstage
from ..services import donations
from ..services import fulfillment as svc

router = APIRouter(prefix="/api/fulfillment", tags=["W8"])


class ConfirmRequest(BaseModel):
    document_id: str
    no: int
    paid_date: str
    proof: dict = {}


@router.get("")
async def get_fulfillment():
    docs = await donations.load_documents()
    return {"summary": svc.summary(docs), "rows": svc.rows(docs)}


@router.post("/upload")
async def upload_proof(
    file: UploadFile = File(...),
    document_id: str | None = Form(default=None),
):
    """증빙 업로드 → 금액·날짜 추출 → 회차 자동 매칭 후보 반환."""
    content = await file.read()
    try:
        parsed = await svc.parse_proof(content, file.filename or "proof.pdf")
    except upstage.UpstageError as e:
        raise HTTPException(502, str(e)) from e

    docs = await donations.load_documents()
    match = svc.match(docs, parsed["extracted"], document_id)

    # 후보를 못 찾으면 이행 대기 중인 회차를 통째로 보내 담당자가 직접 고르게 한다.
    return {
        **parsed,
        **match,
        "open_installments": [] if match["candidates"] else svc.open_installments(docs),
        "auto": match["matched"] is not None,
        "message": (
            f"{match['matched']['donor']} {match['matched']['no']}회차에 자동 매칭했습니다."
            if match["matched"] else "매칭 후보를 확인하고 직접 선택해주세요."
        ),
    }


@router.post("/confirm")
async def confirm(body: ConfirmRequest):
    """회차 이행을 확정한다(자동 매칭 결과 승인 또는 수동 선택)."""
    docs = await donations.load_documents()
    try:
        row = svc.confirm(
            docs, body.document_id, body.no, body.paid_date, body.proof,
            matched_by=body.proof.get("matched_by", "manual"),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"installment": row, "message": f"{body.no}회차를 이행 완료로 기록했습니다."}
