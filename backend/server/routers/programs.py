"""W7 모금 사업 등록."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..clients import upstage
from ..services import agreements, analytics, donations, parsing
from ..services import programs as svc

router = APIRouter(prefix="/api/programs", tags=["W7"])


class ProgramRequest(BaseModel):
    name: str
    goal_amount: int
    start_date: str
    end_date: str
    methods: list[str] = []
    reward: str = ""
    template_id: str | None = None
    legacy_template_id: str | None = None
    description: str = ""
    tags: list[str] = []


class TagRequest(BaseModel):
    text: str


class StatusRequest(BaseModel):
    status: str  # active | archived


@router.get("")
async def list_programs(with_progress: bool = False):
    if not with_progress:
        return {"rows": svc.list_programs()}
    docs = await donations.load_documents()
    progress = analytics.build(docs, svc.list_programs())["program_progress"]
    return {"rows": svc.with_progress(progress)}


@router.get("/{program_id}")
async def get_program(program_id: str):
    """사업 상세 — 사업 정보 + 연결된 서식 + 이 사업의 기부 현황.

    목록 화면에서 사업 이름을 눌렀을 때 필요한 것을 한 번에 내려준다.
    """
    program = svc.get(program_id)
    if not program:
        raise HTTPException(404, f"모금 사업을 찾을 수 없습니다: {program_id}")

    docs = await donations.load_documents()
    progress = analytics.build(docs, svc.list_programs())["program_progress"]
    stat = next((r for r in progress if r["id"] == program_id), {})

    mine = [d for d in docs if d["donation"].get("program_id") == program_id]
    rows = sorted((donations.to_row(d) for d in mine),
                  key=lambda r: r["requested_at"] or "", reverse=True)

    # 기부 유형 분포는 체결된 약정만 센다(서명 대기·거절은 아직 실적이 아니다).
    mix: dict[str, int] = {}
    for d in mine:
        if d["status"] in ("COMPLETED", "EXPIRED"):
            t = d["donation"]["type"]
            mix[t] = mix.get(t, 0) + 1

    return {
        "program": program,
        "progress": {
            "goal_amount": program.get("goal_amount", 0),
            "raised_amount": stat.get("raised_amount", 0),
            "pledged_amount": stat.get("pledged_amount", 0),
            "donor_count": stat.get("donor_count", 0),
            "rate": stat.get("rate", 0),
        },
        "forms": {t: _form_summary(program, t) for t in agreements.DONATION_TYPES},
        "type_mix": [{"label": k, "count": v} for k, v in mix.items()],
        "donations": rows,
    }


def _form_summary(program: dict, donation_type: str) -> dict:
    """이 사업이 그 기부 유형에 쓰는 신청서 양식 요약."""
    template_id = agreements.template_id_for(program, donation_type)
    try:
        form = agreements.contract_form(program["id"], donation_type)
    except ValueError:
        form = {"ready": False, "fields": [], "prefilled_labels": []}
    return {
        "template_id": template_id,
        "template_name": agreements.template_name(template_id),
        "ready": form["ready"],
        "donor_fields": len(form["fields"]),
        "prefilled_fields": len(form["prefilled_labels"]),
    }


@router.post("")
async def create_program(body: ProgramRequest):
    try:
        return {"program": svc.create(body.model_dump())}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/{program_id}")
async def update_program(program_id: str, body: ProgramRequest):
    try:
        return {"program": svc.update(program_id, body.model_dump())}
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


@router.delete("/{program_id}")
async def delete_program(program_id: str):
    """모금 사업 삭제. 약정이 있으면 막는다(그때는 보관을 쓴다)."""
    docs = await donations.load_documents()
    used = sum(1 for d in docs if d["donation"].get("program_id") == program_id)
    try:
        program = svc.delete(program_id, used)
    except ValueError as e:
        # 찾을 수 없으면 404, 약정이 있어 못 지우는 건 409로 구분한다.
        raise HTTPException(404 if used == 0 else 409, str(e)) from e
    return {"program": program, "message": f"'{program['name']}' 사업을 삭제했습니다."}


@router.put("/{program_id}/status")
async def set_status(program_id: str, body: StatusRequest):
    """모금 사업 보관/재개.

    보관하면 개인용 웹 목록에서 빠져 기부자가 새로 선택할 수 없다.
    이미 맺은 약정과 집계는 그대로 남는다.
    """
    try:
        program = svc.set_status(program_id, body.status)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {
        "program": program,
        "message": f"'{program['name']}' 사업을 "
                   + ("보관했습니다. 기부자 화면에서 더 이상 보이지 않습니다."
                      if body.status == svc.ARCHIVED else "다시 진행 중으로 되돌렸습니다."),
    }


@router.post("/parse-notice")
async def parse_notice(file: UploadFile = File(...)):
    """공고문을 올리면 등록 폼을 자동으로 채운다."""
    content = await file.read()
    try:
        return await parsing.parse_notice(content, file.filename or "notice.pdf")
    except upstage.UpstageError as e:
        raise HTTPException(502, str(e)) from e


@router.post("/suggest-tags")
async def suggest_tags(body: TagRequest):
    """사업명·설명만으로 추천 태그를 만든다(기부자 매칭용)."""
    return {"tags": parsing.suggest_tags(body.text)}
