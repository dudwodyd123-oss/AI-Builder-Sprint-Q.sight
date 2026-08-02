"""W2 기부 현황 · 일괄 리마인드 / W3 관리가 필요한 기부자 / W4 약정 상세."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel

from ..clients.modusign import FILE_KINDS, STATUS_LABELS, ModusignError
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
        rows = [r for r in rows if needle in r["donor"] or needle in (r["program_name"] or "")]

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
    files = doc.get("files") or {}
    return {
        "document": doc,
        "history": history,
        "proof_pack": {
            "items": [
                {"key": "agreement", "label": "서명 완료 약정서 PDF",
                 "available": bool(files.get("agreement")) and not modusign.mock},
                {"key": "audit_trail", "label": "감사 추적 인증서 PDF",
                 "available": bool(files.get("audit_trail")) and not modusign.mock},
                {"key": "fulfillment", "label": "이행 증빙 목록 (JSON)", "available": True},
            ],
            "note": "증빙 팩 = 서명 완료 약정서 + 감사 추적 인증서 + 이행 증빙" if not modusign.mock
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
            "name": p.get("name"),
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
async def open_document_file(document_id: str, kind: str = "agreement"):
    """W4 원본 열기 — 서명 완료 약정서 또는 감사 추적 인증서를 새 탭에서 바로 연다.

    모두싸인은 파일을 직접 주지 않고 유효 시간이 짧은 presigned URL을 준다.
    그 주소를 화면으로 넘겨 열게 하면, 주소를 받아오는 사이 팝업 차단에 걸려
    빈 탭만 남는다. 서버가 대신 받아 같은 출처에서 PDF를 그대로 흘려보낸다.
    새로고침해도 그때마다 새 URL을 받으므로 만료에 걸리지 않는다.
    """
    if kind not in FILE_KINDS:
        return _file_error(400, f"알 수 없는 파일 종류: {kind}")
    if modusign.mock:
        return _file_error(409, "데모 모드에서는 실제 PDF가 없습니다.")

    try:
        pdf = await modusign.download_file(document_id, kind)
    except ModusignError as e:
        return _file_error(502, str(e))

    filename = quote(f"{FILE_KINDS[kind][1]}.pdf")
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{filename}"},
    )


def _file_error(status: int, message: str) -> HTMLResponse:
    """이 주소는 새 탭에서 그대로 열리므로, 오류도 사람이 읽을 화면으로 돌려준다."""
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'><title>문서를 열지 못했습니다</title>"
        "<div style=\"font:15px/1.7 system-ui,sans-serif;color:#33475B;padding:48px;max-width:520px\">"
        "<b style='font-size:17px'>문서를 열지 못했습니다</b>"
        f"<p>{escape(message)}</p></div>",
        status_code=status,
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
            "donor": doc["donor"]["name"],
            "donation": doc["donation"],
            "status": doc["derived"]["board_status"],
            "installments": doc.get("installments", []),
            "history": doc.get("history", []),
        }
        zf.writestr("이행내역.json", json.dumps(summary, ensure_ascii=False, indent=2))

        if not modusign.mock:
            # 약정서와 감사 추적 인증서는 서로 다른 PDF다. 둘 다 담는다.
            for kind, filename in (("agreement", "약정서.pdf"),
                                   ("audit_trail", "감사추적인증서.pdf")):
                try:
                    zf.writestr(filename, await modusign.download_file(document_id, kind))
                except ModusignError as e:
                    zf.writestr(f"오류_{filename}.txt", str(e))

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="proof-pack-{document_id}.zip"'},
    )
