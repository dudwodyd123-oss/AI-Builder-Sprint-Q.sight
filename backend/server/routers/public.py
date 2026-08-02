"""개인용 웹이 호출하는 창구.

화면이 아니라 다른 웹이 쓰는 API라 /api/public 아래에 모아 둔다.
호출 주체는 개인용 *서버*를 권한다(브라우저가 직접 부르면 CORS 설정이 필요하고
우리 API를 인터넷에 노출해야 한다).

흐름
    1. GET  /api/public/programs                     사업 목록
    2. GET  /api/public/programs/{id}/contract-form  계약 항목 스키마 (챗봇 체크리스트)
    3. POST /api/public/agreements                   모은 값 → PDF 생성 → 서명 요청 발송
    4. GET  /api/public/agreements/{id}              서명 상태 조회
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..clients.modusign import ModusignError
from ..services import agreements as svc
from ..services import analytics, donations, programs

router = APIRouter(prefix="/api/public", tags=["개인용 웹 연동"])


class Signer(BaseModel):
    name: str
    email: str


class LegacyRecordingNotice(BaseModel):
    """개인용 웹이 알려오는 유산기부 녹음 완료 '사실'.

    녹음 파일·대본·유언 내용·증인 신원은 오지 않는다. 증인은 있었는지(has_witness)만
    받는다. 생전에 기관이 유언 내용을 열람하면 부당한 영향력 행사 의혹의 빌미가 된다.
    """

    agreement_id: str
    pledge_id: str
    program_id: str | None = None
    status: str                      # "recorded" | "verified"
    recorded_at: str
    duration_ms: int | None = None
    sha256: str
    has_witness: bool = False
    checklist_passed: int = 0
    checklist_total: int = 0
    spec_version: str | None = None


class CreateAgreementRequest(BaseModel):
    program_id: str
    # 챗봇이 모은 값. 키는 contract-form이 알려준 field.key와 같아야 한다.
    values: dict = Field(default_factory=dict)
    signer: Signer
    # "legacy"면 유산기부 서식으로 약정서를 만든다.
    donation_type: str = "default"


def _check_donation_type(donation_type: str) -> str:
    """오타로 기본 서식이 나가면 유산기부자에게 회차 금액을 묻게 된다. 명시적으로 막는다."""
    if donation_type not in svc.DONATION_TYPES:
        raise HTTPException(
            400, f"알 수 없는 기부 유형입니다: {donation_type} "
                 f"(가능한 값: {', '.join(svc.DONATION_TYPES)})")
    return donation_type


@router.get("/programs")
async def list_programs():
    """기부자에게 보여줄 모금 사업 목록.

    계약서 서식이 준비된 사업만 실제로 약정을 맺을 수 있으므로
    contract_ready를 함께 내려 개인용 웹이 구분할 수 있게 한다.
    """
    docs = await donations.load_documents()
    progress = analytics.build(docs, programs.list_programs())["program_progress"]

    # 보관된 사업은 기부자가 새로 선택할 수 없어야 하므로 목록에서 뺀다.
    live_ids = {p["id"] for p in programs.list_programs(include_archived=False)}

    rows = []
    for p in programs.with_progress(progress):
        if p["id"] not in live_ids:
            continue
        try:
            ready = svc.contract_form(p["id"])["ready"]
        except ValueError:
            ready = False
        # 유산기부는 서식이 따로라 준비 여부도 따로 본다.
        # 개인용 유산기부 사업 선택 화면이 이걸로 "준비 중"을 가른다.
        try:
            legacy_ready = svc.contract_form(p["id"], "legacy")["ready"]
        except ValueError:
            legacy_ready = False
        rows.append({
            "id": p["id"],
            "name": p["name"],
            "description": p.get("description", ""),
            "goal_amount": p.get("goal_amount"),
            "raised_amount": p.get("raised_amount", 0),
            "rate": p.get("rate", 0),
            "donor_count": p.get("donor_count", 0),
            "start_date": p.get("start_date"),
            "end_date": p.get("end_date"),
            "methods": p.get("methods", []),
            "reward": p.get("reward", ""),
            "tags": p.get("tags", []),
            "contract_ready": ready,
            "legacy_ready": legacy_ready,
        })
    return {"rows": rows}


@router.get("/programs/{program_id}/contract-form")
async def contract_form(program_id: str, donation_type: str = "default"):
    """이 사업의 계약서에 필요한 입력 항목. 챗봇이 이걸로 질문한다.

    ?donation_type=legacy 로 부르면 유산기부 서식을 돌려준다.
    """
    _check_donation_type(donation_type)
    try:
        return svc.contract_form(program_id, donation_type)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


@router.post("/agreements")
async def create_agreement(body: CreateAgreementRequest):
    """약정서를 만들고 기부자에게 서명 요청 메일을 보낸다.

    ⚠️ 실제로 이메일이 발송된다. 챗봇이 모든 항목을 채운 뒤에만 호출할 것.
    """
    _check_donation_type(body.donation_type)
    try:
        record = await svc.create(
            body.program_id, body.values, body.signer.model_dump(), body.donation_type
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except ModusignError as e:
        raise HTTPException(502, str(e)) from e

    return {
        "agreement_id": record["id"],
        "document_id": record["document_id"],
        "status": record["status"],
        "message": f"{record['signer_email']} 으로 서명 요청을 보냈습니다. "
                   "메일함에서 서명을 완료해주세요.",
    }


@router.post("/legacy/recordings")
async def legacy_recording(body: LegacyRecordingNotice):
    """유산기부 녹음유언이 만들어졌다는 사실을 받아 약정에 남긴다.

    같은 건이 recorded → verified 로 두 번 오는 것이 정상이고, 실패하면 개인용이
    나중에 다시 보낸다. 멱등하게 처리한다.
    """
    try:
        record = svc.save_recording_notice(body.model_dump())
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    return {
        "agreement_id": record["id"],
        "legacy_recording": record["legacy_recording"],
        "message": "녹음 확인 완료를 기록했습니다." if body.status == "verified"
                   else "녹음 완료를 기록했습니다.",
    }


@router.get("/agreements/{agreement_id}")
async def agreement_status(agreement_id: str):
    """서명이 끝났는지 확인한다. 웹훅을 못 쓰는 동안 폴링으로 쓴다."""
    try:
        record = await svc.status(agreement_id)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except ModusignError as e:
        raise HTTPException(502, str(e)) from e

    return {
        "agreement_id": record["id"],
        "program_name": record.get("program_name"),
        "status": record.get("status"),
        "signed": record.get("status") == "COMPLETED",
        "signed_at": record.get("signed_at"),
        "created_at": record.get("created_at"),
    }
