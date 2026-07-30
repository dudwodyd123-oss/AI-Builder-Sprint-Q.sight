"""W2 기부 현황 · 일괄 리마인드 / W3 관리가 필요한 기부자 / W4 약정 상세."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..clients.modusign import STATUS_LABELS, ModusignError
from ..clients.modusign import client as modusign
from ..services import donations as svc
from ..services import risk

router = APIRouter(prefix="/api/donations", tags=["W2-W4"])


class RemindRequest(BaseModel):
    document_ids: list[str]


class RulesRequest(BaseModel):
    rules: dict


# ── W2 기부 현황 ───────────────────────────────────────────
@router.get("")
async def list_donations(status: str | None = None, q: str | None = None):
    docs = await svc.load_documents()
    rows = [svc.to_row(d) for d in docs]

    counts = {
        "all": len(rows),
        "pending": sum(1 for r in rows if r["is_pending_signature"]),
        "delayed": sum(1 for r in rows if r["status"].startswith("지연")),
        "normal": sum(1 for r in rows if r["status"] == "정상"),
    }

    if status == "pending":
        rows = [r for r in rows if r["is_pending_signature"]]
    elif status == "delayed":
        rows = [r for r in rows if r["status"].startswith("지연")]
    elif status == "normal":
        rows = [r for r in rows if r["status"] == "정상"]

    if q:
        needle = q.strip()
        rows = [r for r in rows if needle in r["donor_full"] or needle in (r["program_name"] or "")]

    return {
        "rows": rows,
        "counts": counts,
        "reminder_note": svc.recent_reminder_note(docs),
        "hint": "리마인드는 진행 중인 계약 안내 → 광고성 발송과 분리해 처리됩니다",
    }


@router.post("/remind")
async def send_reminders(body: RemindRequest):
    """미서명자 일괄 재발송."""
    if not body.document_ids:
        raise HTTPException(400, "선택된 문서가 없습니다.")

    results = []
    for doc_id in body.document_ids:
        try:
            results.append(await modusign.remind(doc_id))
        except ModusignError as e:
            results.append({"ok": False, "document_id": doc_id, "error": str(e)})

    sent = sum(1 for r in results if r.get("ok"))
    return {
        "sent": sent,
        "failed": len(results) - sent,
        "results": results,
        "message": f"{sent}건의 서명 리마인드를 보냈습니다.",
    }


# ── W3 관리가 필요한 기부자 ────────────────────────────────
@router.get("/at-risk")
async def at_risk():
    docs = await svc.load_documents()
    return risk.build(docs)


@router.put("/at-risk/rules")
async def update_rules(body: RulesRequest):
    return {"rules": risk.save_rules(body.rules)}


# ── W4 약정 상세 · 이력 ────────────────────────────────────
@router.get("/{document_id}")
async def get_detail(document_id: str):
    docs = await svc.load_documents()
    doc = next((d for d in docs if d["id"] == document_id), None)
    if not doc:
        raise HTTPException(404, "약정 문서를 찾을 수 없습니다.")

    history = doc.get("history") or await modusign.get_histories(document_id)
    return {
        "document": doc,
        "history": history,
        "proof_pack": {
            "items": [
                {"key": "agreement", "label": "서명 완료 약정서 PDF", "available": not modusign.mock},
                {"key": "audit", "label": "감사 추적 인증서 (약정서 PDF에 포함)",
                 "available": not modusign.mock},
                {"key": "fulfillment", "label": "이행 증빙 목록 (JSON)", "available": True},
            ],
            "note": "증빙 팩 = 서명 완료 약정서(감사 추적 포함) + 이행 증빙" if not modusign.mock
                    else "데모 모드에서는 이행 증빙 요약만 내려받을 수 있습니다.",
        },
    }


@router.get("/{document_id}/refresh")
async def refresh_document(document_id: str):
    """W4 실시간 서명 상태 조회 — 캐시를 건너뛰고 모두싸인에서 다시 읽는다."""
    try:
        doc = await modusign.fetch_document_fresh(document_id)
    except ModusignError as e:
        raise HTTPException(502, str(e)) from e
    if not doc:
        raise HTTPException(404, "약정 문서를 찾을 수 없습니다.")

    participants = [
        {
            "name": p.get("masked_name") or p.get("name"),
            "status": p.get("status"),
            "viewed_at": p.get("viewed_at"),
            "signed_at": p.get("signed_at"),
        }
        for p in doc.get("participants", [])
    ]
    return {
        "document_id": doc["id"],
        "status": doc["status"],
        "status_label": STATUS_LABELS.get(doc["status"], doc["status"]),
        "completed_at": doc.get("completed_at"),
        "participants": participants,
        "checked_at": datetime.now().isoformat(timespec="seconds"),
        "source": "demo" if modusign.mock else "modusign",
    }


@router.get("/{document_id}/file")
async def download_document_file(document_id: str):
    """W4 약정서 원본 — 서명 완료 PDF(감사 추적 페이지 포함)."""
    if modusign.mock:
        raise HTTPException(409, "데모 모드에서는 실제 약정서 PDF가 없습니다.")
    try:
        content = await modusign.download_file(document_id)
    except ModusignError as e:
        raise HTTPException(502, str(e)) from e

    if isinstance(content, dict):
        # 응답이 JSON이면 다운로드 URL만 내려주는 형태다(유효시간 짧음).
        url = content.get("downloadUrl") or (content.get("file") or {}).get("downloadUrl")
        if url:
            return {"download_url": url, "note": "이 URL은 유효 시간이 짧습니다."}
        raise HTTPException(502, "약정서 파일 응답을 해석하지 못했습니다.")

    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="agreement-{document_id}.pdf"'},
    )


@router.get("/{document_id}/proof-pack")
async def download_proof_pack(document_id: str):
    """W4 증빙 팩 내려받기 — 약정서 + 감사 추적 인증서 + 이행 내역을 zip으로 묶는다."""
    docs = await svc.load_documents()
    doc = next((d for d in docs if d["id"] == document_id), None)
    if not doc:
        raise HTTPException(404, "약정 문서를 찾을 수 없습니다.")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        summary = {
            "document_id": doc["id"],
            "donor": doc["donor"]["masked_name"],
            "donation": doc["donation"],
            "status": doc["derived"]["board_status"],
            "installments": doc.get("installments", []),
            "history": doc.get("history", []),
        }
        zf.writestr("이행내역.json", json.dumps(summary, ensure_ascii=False, indent=2))

        if not modusign.mock:
            # 감사 추적 인증서는 별도 API가 없고 서명 완료 PDF에 포함되어 나온다.
            try:
                zf.writestr("약정서_감사추적포함.pdf", await modusign.download_file(document_id))
            except ModusignError as e:
                zf.writestr("오류.txt", str(e))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="proof-pack-{document_id}.zip"'},
    )
