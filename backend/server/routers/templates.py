"""W5 서식 업로드 · 항목 추출 / W6 계약서 서식 편집."""

from __future__ import annotations

import base64
import io
from datetime import date, datetime

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import store
from ..clients import upstage
from ..clients.modusign import ModusignError
from ..clients.modusign import client as modusign
from ..services import contract, parsing
from ..services import programs as program_svc

router = APIRouter(prefix="/api/templates", tags=["W5-W6"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class SaveTemplateRequest(BaseModel):
    name: str
    fields: list[dict]
    source_id: str | None = None
    template_id: str | None = None


class PreviewRequest(BaseModel):
    name: str = ""
    fields: list[dict]


@router.get("")
async def list_templates():
    """모두싸인 템플릿 + 이 앱에서 만든 서식.

    deletable은 우리 저장소에 있는 것만 True다. 모두싸인 쪽 템플릿과
    데모 기본 서식은 여기서 지울 수 없다.
    """
    remote = await modusign.list_templates()
    local = store.read_list("templates")
    known = {t["id"] for t in remote}

    rows = [{**t, "deletable": False, "origin": "modusign"} for t in remote]
    rows += [{**t, "deletable": True, "origin": "qsight"}
             for t in local if t["id"] not in known]
    return {"rows": rows}


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    """이 앱에서 만든 서식을 지운다.

    모금 사업이 쓰고 있으면 막는다. 그냥 지우면 그 사업의 계약 항목이
    사라져서 개인용 웹 챗봇이 질문할 게 없어진다.
    """
    row = store.find("templates", template_id)
    if not row:
        raise HTTPException(404, "이 앱에서 만든 서식이 아닙니다. 모두싸인 템플릿은 여기서 지울 수 없습니다.")

    using = [p["name"] for p in program_svc.list_programs()
             if p.get("template_id") == template_id]
    if using:
        raise HTTPException(
            409,
            f"이 서식을 쓰는 모금 사업이 있어 지울 수 없습니다: {', '.join(using)}. "
            "사업의 연결 서식을 먼저 바꿔주세요.",
        )

    store.remove("templates", template_id)
    return {"deleted": True, "id": template_id,
            "message": f"'{row.get('name', template_id)}' 서식을 삭제했습니다."}


# ── W5 서식 업로드 → 항목 추출 ─────────────────────────────
@router.post("/parse")
async def parse_form(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "20MB 이하 파일만 업로드할 수 있습니다.")

    try:
        result = await parsing.parse_form(content, file.filename or "form.pdf")
    except upstage.UpstageError as e:
        raise HTTPException(502, str(e)) from e

    result["id"] = store.next_id("form_extractions", "ext")
    result["created_at"] = datetime.now().isoformat(timespec="seconds")
    store.append("form_extractions", result)
    return result


@router.get("/extractions/{extraction_id}")
async def get_extraction(extraction_id: str):
    row = store.find("form_extractions", extraction_id)
    if not row:
        raise HTTPException(404, "추출 결과를 찾을 수 없습니다.")
    return row




# ── W6 템플릿 저장 ─────────────────────────────────────────
@router.post("/save")
async def save_template(body: SaveTemplateRequest):
    """계약서 서식을 저장한다.

    모두싸인 임베디드 편집기는 쓰지 않는다. 최종 계약서 PDF를
    services/contract.py가 직접 그리므로 서명란 좌표를 모두싸인에서
    다시 잡을 필요가 없다(같은 일을 두 번 하게 된다).

    서명자 이름·이메일도 여기서 받지 않는다. 그건 기부자가 개인용 웹에서
    약정을 맺을 때 정해진다.
    """
    if not body.name.strip():
        raise HTTPException(400, "템플릿 이름을 입력해주세요.")
    fields = [f for f in body.fields if f.get("key")]
    if not fields:
        raise HTTPException(400, "항목이 없습니다.")

    template_id = body.template_id or store.next_id("templates", "tpl")
    saved = {
        "id": template_id,
        "template_id": template_id,
        "name": body.name.strip(),
        "fields": fields,
        "updated_at": date.today().isoformat(),
        "status": "saved",
        "source_id": body.source_id,
    }
    store.upsert("templates", saved)

    if body.source_id:
        row = store.find("form_extractions", body.source_id)
        if row:
            row["template_id"] = template_id
            store.upsert("form_extractions", row)

    return {
        "template": saved,
        "message": f"'{saved['name']}' 서식을 저장했습니다. 모금 사업에 연결해 사용하세요.",
    }


@router.post("/preview")
async def preview_template(body: PreviewRequest):
    """저장 전에 실제 계약서가 어떻게 나오는지 PDF로 보여준다.

    모두싸인 편집기 대신 우리가 만드는 진짜 결과물을 그대로 보여준다.
    """
    fields = [f for f in body.fields if f.get("key")]
    if not fields:
        raise HTTPException(400, "미리보기할 항목이 없습니다.")

    program = {
        "name": body.name.strip() or "기부",
        "description": "미리보기용 예시입니다. 실제 사업 정보로 대체됩니다.",
        "start_date": date.today().isoformat(),
        "end_date": date.today().isoformat(),
    }
    sample = {f["key"]: _sample_value(f) for f in fields}
    pdf_base64 = contract.build_agreement_pdf(
        program, fields, sample,
        {"name": "홍길동", "email": "donor@example.com"},
    )
    return StreamingResponse(
        io.BytesIO(base64.b64decode(pdf_base64)),
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="preview.pdf"'},
    )


def _sample_value(field: dict):
    """미리보기용 예시 값. 실제 값이 어느 자리에 찍히는지 보여주는 게 목적이다."""
    ftype = field.get("type")
    if ftype == "number":
        return "30000"
    if ftype == "check":
        return True
    if ftype == "date":
        return date.today().isoformat()
    if ftype == "select":
        return "예시 선택값"
    if ftype == "textarea":
        return "기부자가 남긴 내용이 이 자리에 들어갑니다."
    return "예시 입력값"
