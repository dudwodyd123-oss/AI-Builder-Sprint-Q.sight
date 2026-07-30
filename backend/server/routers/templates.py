"""W5 서식 업로드 · 항목 추출 / W6 템플릿 편집 · 서명란 배치."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from .. import store
from ..clients import upstage
from ..clients.modusign import ModusignError
from ..clients.modusign import client as modusign
from ..services import parsing

router = APIRouter(prefix="/api/templates", tags=["W5-W6"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class SaveTemplateRequest(BaseModel):
    name: str
    fields: list[dict]
    source_id: str | None = None
    # 역할별 서명자. [{"role": "기부자", "name": "...", "email": "..."}]
    participants: list[dict] = []


@router.get("")
async def list_templates():
    """모두싸인 템플릿 + 이 앱에서 만든 템플릿."""
    remote = await modusign.list_templates()
    local = store.read_list("templates")
    known = {t["id"] for t in remote}
    return {"rows": remote + [t for t in local if t["id"] not in known]}


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


# ── W6 템플릿 저장(서명란 배치 확정) ───────────────────────
@router.post("/save")
async def save_template(body: SaveTemplateRequest):
    """배치된 항목으로 모두싸인 임베디드 템플릿을 만들고 templateId를 확보한다."""
    if not body.fields:
        raise HTTPException(400, "배치할 항목이 없습니다.")
    if not any(f.get("type") == "sign" for f in body.fields):
        raise HTTPException(400, "서명란이 최소 1개 필요합니다.")
    if not body.name.strip():
        raise HTTPException(400, "템플릿 제목을 입력해주세요.")

    # 초안을 만들기 전에 기존 템플릿 목록을 기억해 둔다.
    # 나중에 목록을 다시 읽어 새로 생긴 것을 찾는 방식으로 templateId를 회수한다.
    known_ids = []
    if not modusign.mock:
        try:
            known_ids = [t["id"] for t in await modusign.list_templates() if t.get("id")]
        except ModusignError:
            known_ids = []

    try:
        result = await modusign.create_embedded_template(
            body.name.strip(), body.fields, body.participants
        )
    except ModusignError as e:
        raise HTTPException(502, str(e)) from e

    # embedded_url에는 JWT가 들어 있으므로 저장하지 않는다. 브라우저로 한 번만 내려보낸다.
    store.upsert("templates", {
        "id": result["id"],
        "name": result["name"],
        "fields": result["fields"],
        "updated_at": date.today().isoformat(),
        "status": "editing" if result.get("is_draft") else "saved",
        "known_template_ids": known_ids,
        "source_id": body.source_id,
        "expiry": result.get("expiry"),
    })

    if body.source_id:
        row = store.find("form_extractions", body.source_id)
        if row:
            row["draft_id"] = result["id"]
            store.upsert("form_extractions", row)

    return {
        "template": result,
        "needs_link": bool(result.get("is_draft")) and not modusign.mock,
        "message": "모두싸인 편집기를 열었습니다. 배치를 마치면 '템플릿 연결'을 눌러주세요."
                   if result.get("is_draft") and not modusign.mock
                   else f"템플릿을 저장했습니다. templateId: {result['id']}",
    }


@router.post("/{draft_id}/link")
async def link_template(draft_id: str):
    """편집기에서 저장된 템플릿을 찾아 초안과 연결한다.

    모두싸인이 저장 완료 콜백을 주지 않아서, 담당자가 배치를 마쳤다고 알려주면
    템플릿 목록을 다시 읽어 새로 생긴 것을 찾는다.
    """
    row = store.find("templates", draft_id)
    if not row:
        raise HTTPException(404, "초안을 찾을 수 없습니다.")

    try:
        found = await modusign.find_new_template(row.get("known_template_ids") or [])
    except ModusignError as e:
        raise HTTPException(502, str(e)) from e

    if not found:
        return {
            "linked": False,
            "message": "아직 새 템플릿이 보이지 않습니다. 편집기에서 저장했는지 확인하고 다시 눌러주세요.",
        }

    row.update({
        "template_id": found["id"],
        "name": found.get("name") or row["name"],
        "status": "linked",
        "linked_at": datetime.now().isoformat(timespec="seconds"),
    })
    store.upsert("templates", row)

    if row.get("source_id"):
        extraction = store.find("form_extractions", row["source_id"])
        if extraction:
            extraction["template_id"] = found["id"]
            store.upsert("form_extractions", extraction)

    return {
        "linked": True,
        "template_id": found["id"],
        "name": row["name"],
        "message": f"templateId {found['id']} 를 연결했습니다.",
    }
