"""W8 이행 관리 · 증빙 매칭."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..clients import upstage
from ..services import donations
from ..services import fulfillment as svc
from ..services import programs as program_svc

router = APIRouter(prefix="/api/fulfillment", tags=["W8"])


MAX_BATCH_FILES = 20


class ConfirmRequest(BaseModel):
    document_id: str
    no: int
    paid_date: str
    proof: dict = {}


class ConfirmBatchRequest(BaseModel):
    items: list[ConfirmRequest] = []


@router.get("")
async def get_fulfillment():
    """이행 관리 첫 화면 — 상단 KPI + 모금 사업 카드."""
    docs = await donations.load_documents()
    return {
        "summary": svc.summary(docs),
        "programs": svc.program_cards(docs, program_svc.list_programs()),
    }


@router.get("/overdue")
async def get_overdue():
    """지연된 회차만 사업을 가로질러 모아 본다(월말 정산용)."""
    docs = await donations.load_documents()
    return {"rows": svc.overdue_rows(docs)}


@router.get("/programs/{program_id}")
async def get_program_donors(program_id: str):
    """한 사업에 참여한 기부자 목록."""
    docs = await donations.load_documents()
    program = program_svc.get(program_id)
    return {
        "program": {"id": program_id, "name": (program or {}).get("name") or "사업 미지정"},
        "rows": svc.program_donors(docs, program_id),
    }


@router.get("/agreements/{document_id}")
async def get_agreement(document_id: str):
    """한 기부자(약정)의 회차별 이행 목록."""
    docs = await donations.load_documents()
    try:
        return svc.agreement_installments(docs, document_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


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


@router.post("/upload-batch")
async def upload_proofs(files: list[UploadFile] = File(...)):
    """영수증 여러 장을 한 번에 읽어 회차 후보를 붙인다.

    **확정하지 않는다.** 자동 매칭 결과를 바로 기록하면 한 번에 여러 건이
    잘못 들어갈 수 있어서, 담당자가 표에서 확인하고 고른 것만 확정한다.
    """
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(413, f"한 번에 {MAX_BATCH_FILES}장까지 올릴 수 있습니다.")

    docs = await donations.load_documents()
    used: set[tuple[str, int]] = set()   # 같은 회차에 두 장이 붙는 것을 막는다
    results = []

    for f in files:
        content = await f.read()
        name = f.filename or "proof.pdf"
        try:
            parsed = await svc.parse_proof(content, name)
        except upstage.UpstageError as e:
            results.append({"filename": name, "state": "error", "message": str(e)})
            continue

        match = svc.match(docs, parsed["extracted"])
        candidates = [c for c in match["candidates"] if (c["document_id"], c["no"]) not in used]
        matched = match["matched"]
        if matched and (matched["document_id"], matched["no"]) in used:
            matched = None

        if matched:
            used.add((matched["document_id"], matched["no"]))
            state = "auto"
        elif candidates:
            state = "ambiguous"
        else:
            state = "none"

        results.append({
            "filename": name,
            "state": state,
            "extracted": parsed["extracted"],
            "fallback": parsed.get("fallback"),
            "matched": matched,
            "candidates": candidates[:5],
        })

    counts = {k: sum(1 for r in results if r["state"] == k)
              for k in ("auto", "ambiguous", "none", "error")}
    return {
        "results": results,
        "counts": counts,
        "open_installments": svc.open_installments(docs) if counts["none"] else [],
        "message": f"{len(files)}장 중 {counts['auto']}장이 자동으로 매칭됐습니다. "
                   "확인 후 확정해주세요.",
    }


@router.post("/confirm-batch")
async def confirm_batch(body: ConfirmBatchRequest):
    """검토를 마친 항목만 한꺼번에 확정한다."""
    if not body.items:
        raise HTTPException(400, "확정할 항목이 없습니다.")

    docs = await donations.load_documents()
    done, failed = [], []
    for item in body.items:
        try:
            svc.confirm(docs, item.document_id, item.no, item.paid_date, item.proof,
                        matched_by=item.proof.get("matched_by", "manual"))
            done.append({"document_id": item.document_id, "no": item.no})
        except ValueError as e:
            failed.append({"document_id": item.document_id, "no": item.no, "error": str(e)})
        # 확정한 내용이 다음 항목 판단에 반영되도록 다시 읽는다.
        docs = await donations.load_documents()

    return {
        "confirmed": len(done),
        "failed": failed,
        "message": f"{len(done)}건을 이행 완료로 기록했습니다."
                   + (f" {len(failed)}건은 실패했습니다." if failed else ""),
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
