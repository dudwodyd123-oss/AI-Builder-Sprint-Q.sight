"""W7 모금 사업 등록."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..clients import upstage
from ..services import analytics, donations, parsing
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
    description: str = ""
    tags: list[str] = []


class TagRequest(BaseModel):
    text: str


@router.get("")
async def list_programs(with_progress: bool = False):
    if not with_progress:
        return {"rows": svc.list_programs()}
    docs = await donations.load_documents()
    progress = analytics.build(docs, svc.list_programs())["program_progress"]
    return {"rows": svc.with_progress(progress)}


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
