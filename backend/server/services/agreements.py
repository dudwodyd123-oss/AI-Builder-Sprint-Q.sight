"""약정 체결 — 계약 항목 스키마 해석, PDF 생성, 서명 요청 발송.

개인용 웹과의 접점이다. 흐름은 이렇다.

    개인용: 사업 목록 조회 → 계약 항목 스키마 조회 → 챗봇으로 값 수집
    기업용: 값 받기 → PDF 생성 → 모두싸인 서명 요청 → 기부자 메일로 발송

발송된 문서는 모두싸인에 남으므로 W1·W2·W4 화면에는 자동으로 나타난다.
여기서 로컬에 남기는 기록은 상태 조회와 사업 연결을 위한 것이다.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime

from .. import store
from ..clients.modusign import METADATA_LIMIT, ModusignError
from ..clients.modusign import client as modusign
from .contract import SIGN_ANCHOR, build_agreement_pdf
from .programs import get as get_program

# 기부자가 직접 채우는 항목만 챗봇이 물어본다.
DONOR_ROLE = "기부자"

# 기부 유형별로 다른 서식을 쓴다.
#   default — 정기·일시·봉사. program["template_id"]
#   legacy  — 유산기부.        program["legacy_template_id"]
# 유산기부는 회차 금액·납부 주기·약정 기간이 없고 "무엇을 얼마나 남길지"를 특정하므로
# 같은 사업이라도 서식이 달라야 한다.
DONATION_TYPES = ("default", "legacy")

# 모두싸인 metadatas로 넘길 키. 이 값들이 있어야 기업용 대시보드 집계가 맞는다.
# 최대 10개라 새 키를 넣으려면 기존 키를 빼야 한다.
METADATA_KEYS = [
    "donation_type", "amount", "frequency", "term_months",
    "program_id", "program_name", "start_date", "end_date",
    "receipt_required", "motivation",
]

# 챗봇이 모은 값에서 metadatas 키를 유추할 때 쓰는 별칭.
# 서식마다 항목 이름이 달라서 그대로는 못 맞춘다.
_ALIASES = {
    "amount": ["amount", "회차_금액", "기부_금액", "금액", "기부금액"],
    "frequency": ["frequency", "납부_주기", "주기", "납부주기"],
    "term_months": ["term_months", "약정_기간", "기간", "약정기간"],
    "donation_type": ["donation_type", "기부_방식", "기부_유형", "방식"],
    "motivation": ["motivation", "기부_동기", "동기"],
    "receipt_required": ["receipt_required", "기부금영수증_발급", "영수증"],
}


# ── 계약 항목 스키마 ────────────────────────────────────────
def contract_form(program_id: str, donation_type: str = "default") -> dict:
    """사업에 연결된 계약서의 입력 항목을 돌려준다.

    항목은 두 갈래로 나뉜다.

    - prefilled : 기관이 서식을 만들 때 미리 채워 둔 값(후원기관명, 담당 부서 등).
                  이미 정해진 값이라 챗봇이 물어보면 안 된다.
    - fields    : 기부자가 채워야 하는 나머지. 챗봇은 이것만 물어본다.

    기관이 서식을 바꾸면 여기 결과가 바뀌고 챗봇 질문도 저절로 따라간다.
    donation_type이 "legacy"면 사업에 연결된 유산기부 서식을 쓴다.
    """
    program = get_program(program_id)
    if not program:
        raise ValueError(f"모금 사업을 찾을 수 없습니다: {program_id}")

    fields = _resolve_fields(program, donation_type)
    prefilled, donor_fields = split_fields(fields)

    return {
        "program_id": program_id,
        "program_name": program.get("name"),
        "donation_type": donation_type,
        "ready": bool(donor_fields) or bool(prefilled),
        "schema_version": _schema_version(fields),
        # 기관이 미리 채운 값. 개인용 웹은 그대로 들고 있다가 ③에 되돌려주면 된다.
        "prefilled": {f["key"]: f.get("value") for f in prefilled},
        "prefilled_labels": [
            {"key": f["key"], "label": f.get("label"), "value": f.get("value")}
            for f in prefilled
        ],
        # 챗봇이 물어볼 항목.
        # required·options는 서식이 직접 정한 값을 우선한다. 유산 서식에는
        # 조건·용도 지정처럼 선택 항목이 있어서, 비-check을 전부 필수로 두면 안 된다.
        "fields": [
            {
                "key": f.get("key"),
                "label": f.get("label"),
                "type": f.get("type", "text"),
                "required": f.get("required", f.get("type") != "check"),
                "options": f.get("options") or _options(f, program),
            }
            for f in donor_fields
        ],
        "note": "" if (donor_fields or prefilled) else _empty_note(donation_type),
    }


def _empty_note(donation_type: str) -> str:
    if donation_type == "legacy":
        return ("이 사업에는 유산기부 서식이 연결되어 있지 않습니다. "
                "기관이 유산기부 서식을 만들어 사업에 연결해야 합니다.")
    return "이 사업에 연결된 계약서 서식이 아직 없습니다. 기관이 서식을 등록해야 합니다."


def split_fields(fields: list[dict]) -> tuple[list[dict], list[dict]]:
    """항목을 (기관이 미리 채운 것, 기부자가 채울 것)으로 나눈다.

    판단 기준은 '값이 이미 있는가'다. 담당자 몫이든 기부자 몫이든,
    기관이 값을 적어 두었으면 챗봇은 그 항목을 건너뛴다.
    """
    prefilled, remaining = [], []
    for f in fields:
        if f.get("type") == "sign":
            continue  # 서명란은 PDF 앵커로 처리한다
        if _has_value(f):
            prefilled.append(f)
        elif f.get("assignee", DONOR_ROLE) == DONOR_ROLE:
            remaining.append(f)
        else:
            # 담당자 몫인데 값이 비어 있다. 기부자에게 물어볼 수는 없으니
            # 빈 칸으로 두고 계약서에는 "—"로 찍힌다.
            prefilled.append({**f, "value": ""})
    return prefilled, remaining


def _has_value(field: dict) -> bool:
    value = field.get("value")
    if isinstance(value, bool):
        return True
    return str(value or "").strip() != ""


def template_id_for(program: dict, donation_type: str = "default") -> str | None:
    """이 사업이 그 기부 유형에 쓰는 서식 id. 없으면 그 유형은 접수하지 않는다."""
    return (program.get("legacy_template_id") if donation_type == "legacy"
            else program.get("template_id"))


def template_name(template_id: str | None) -> str | None:
    """서식 이름. 저장소 → 데모 순으로 찾는다(모두싸인 템플릿은 비동기라 제외)."""
    if not template_id:
        return None
    for row in store.read_list("templates"):
        if template_id in (row.get("id"), row.get("template_id")):
            return row.get("name")
    from ..clients.mock_data import TEMPLATES
    return next((t["name"] for t in TEMPLATES if t["id"] == template_id), None)


def _resolve_fields(program: dict, donation_type: str = "default") -> list[dict]:
    """사업 → 템플릿 → 항목 목록. 여러 곳에 흩어져 있어 순서대로 찾는다."""
    template_id = template_id_for(program, donation_type)
    if not template_id:
        return []

    # 1) W6에서 저장하며 연결한 템플릿
    for row in store.read_list("templates"):
        if template_id and row.get("template_id") == template_id:
            return row.get("fields") or []
        if row.get("id") == template_id:
            return row.get("fields") or []

    # 2) W5 추출 결과에 붙어 있는 경우
    for row in store.read_list("form_extractions"):
        if row.get("template_id") == template_id:
            return row.get("fields") or []

    # 3) 데모 템플릿(모두싸인 미연동 상태)
    from ..clients.mock_data import TEMPLATES
    for t in TEMPLATES:
        if t["id"] == template_id:
            return [{**f, "key": f["key"]} for f in t["fields"]]
    return []


def _options(field: dict, program: dict) -> list[str] | None:
    """선택형 항목의 보기. 사업에 정해진 값이 있으면 그걸 쓴다."""
    if field.get("type") != "select":
        return None
    key = (field.get("key") or "") + (field.get("label") or "")
    if "주기" in key or "frequency" in key:
        return ["월", "연", "일시"]
    if "방식" in key or "유형" in key or "type" in key:
        return program.get("methods") or ["정기", "일시", "봉사", "유산"]
    if "사업" in key or "program" in key:
        return [program.get("name", "")]
    return None


def _schema_version(fields: list[dict]) -> str:
    """항목 구성이 바뀌면 값이 바뀐다. 진행 중이던 대화가 어긋난 걸 알아채는 용도."""
    keys = "|".join(sorted(str(f.get("key")) for f in fields))
    return f"v{abs(hash(keys)) % 100000:05d}"


# ── 약정 체결 ──────────────────────────────────────────────
async def create(program_id: str, values: dict, signer: dict,
                 donation_type: str = "default") -> dict:
    """PDF를 만들고 모두싸인으로 서명 요청을 보낸다.

    ⚠️ 이 함수는 서명자에게 실제 이메일을 발송한다.
    """
    program = get_program(program_id)
    if not program:
        raise ValueError(f"모금 사업을 찾을 수 없습니다: {program_id}")
    # 대화 도중에 기관이 사업을 보관했을 수 있다. 목록에서 빠진 뒤에도
    # 진행 중이던 세션이 약정을 맺어버리는 걸 막는다.
    if program.get("status") == "archived":
        raise ValueError(f"'{program.get('name')}' 사업은 모금이 종료되었습니다.")
    if not (signer.get("name") or "").strip():
        raise ValueError("서명자 이름이 필요합니다.")
    if not (signer.get("email") or "").strip():
        raise ValueError("서명자 이메일이 필요합니다.")

    fields = _resolve_fields(program, donation_type)
    if not fields:
        raise ValueError(
            f"'{program.get('name')}' 사업에는 유산기부 서식이 연결되어 있지 않습니다."
            if donation_type == "legacy"
            else f"'{program.get('name')}' 사업에 연결된 계약서 서식이 없습니다."
        )
    missing = missing_fields(fields, values)
    if missing:
        raise ValueError(f"아직 비어 있는 항목이 있습니다: {', '.join(missing)}")

    # 기관이 미리 채운 값을 합친다. 기부자가 같은 키를 보내와도 기관 값이 이긴다
    # (후원기관명 같은 건 기부자가 바꿀 수 있으면 안 된다).
    merged = merge_values(fields, values)

    pdf_base64 = build_agreement_pdf(program, fields, merged, signer)
    title = f"{program.get('name', '기부')} 약정서 - {signer['name']}"

    try:
        result = await modusign.request_signature(
            title=title,
            pdf_base64=pdf_base64,
            signer=signer,
            metadatas=_metadatas(program, merged, donation_type),
            anchor_text=SIGN_ANCHOR,
        )
    except ModusignError as e:
        raise ModusignError(f"서명 요청 발송에 실패했습니다: {e}") from e

    record = {
        "id": store.next_id("agreements", "agr"),
        "program_id": program_id,
        "program_name": program.get("name"),
        "donation_type": donation_type,
        "document_id": result.get("id"),
        "signer_name": signer["name"],
        "signer_email": signer["email"],
        "status": result.get("status", "ON_GOING"),
        "values": merged,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "signed_at": None,
    }
    store.append("agreements", record)
    return record


def missing_fields(fields: list[dict], values: dict) -> list[str]:
    """스키마와 입력값의 차집합. 챗봇이 '빠진 것'을 판단하는 기준과 같다.

    기관이 미리 채운 항목은 기부자가 안 보내도 빠진 것이 아니다.
    서식이 required: false로 정한 항목(유산 서식의 조건·용도 지정 등)도 마찬가지다.
    """
    _, donor_fields = split_fields(fields)
    out = []
    for f in donor_fields:
        if not f.get("required", f.get("type") != "check"):
            continue
        if not str(values.get(f.get("key"), "")).strip():
            out.append(f.get("label") or f.get("key"))
    return out


def merge_values(fields: list[dict], values: dict) -> dict:
    """기부자 입력 위에 기관 선입력 값을 덮어쓴다.

    순서가 중요하다. 기관이 정한 값(후원기관명 등)은 기부자가 같은 키로
    무엇을 보내오든 바뀌면 안 된다.
    """
    prefilled, _ = split_fields(fields)
    merged = dict(values)
    for f in prefilled:
        merged[f["key"]] = f.get("value", "")
    return merged


def _metadatas(program: dict, values: dict, donation_type: str = "default") -> dict:
    """집계에 쓰는 값만 골라 모두싸인 metadatas로 만든다(최대 10개)."""
    today = date.today()
    meta = {
        "program_id": program.get("id", ""),
        "program_name": program.get("name", ""),
        "start_date": today.isoformat(),
    }

    for key, names in _ALIASES.items():
        for name in names:
            if values.get(name) not in (None, ""):
                meta[key] = values[name]
                break

    # 기간이 있으면 종료일을 계산해 둔다. 대시보드의 만료 임박·예상 수입이 이걸 쓴다.
    months = _to_int(meta.get("term_months"))
    if months:
        meta["end_date"] = _add_months(today, months).isoformat()

    # 유산은 납부 주기가 없어서 추론에 맡기면 "일시"로 떨어진다. W1 유형 분포가
    # 어긋나므로 명시한다. 서식이 보낸 값보다 우선한다.
    if donation_type == "legacy":
        meta["donation_type"] = "유산"
    elif "donation_type" not in meta:
        freq = str(meta.get("frequency", ""))
        meta["donation_type"] = "정기" if freq in ("월", "연") else "일시"
    meta.setdefault("receipt_required", "true")

    return {k: v for k, v in list(meta.items())[:METADATA_LIMIT] if v not in (None, "")}


def _add_months(d: date, months: int) -> date:
    """개월을 더한다. 말일은 그 달의 마지막 날로 맞춘다(1/31 + 1개월 = 2/28)."""
    y, m = d.year, d.month + months
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    last = calendar.monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def _to_int(value) -> int | None:
    try:
        return int(str(value).replace(",", "").replace("개월", "").strip())
    except (TypeError, ValueError):
        return None


# ── 상태 조회 ──────────────────────────────────────────────
def get_record(agreement_id: str) -> dict | None:
    return store.find("agreements", agreement_id)


async def status(agreement_id: str) -> dict:
    """모두싸인에서 최신 서명 상태를 읽어 기록에 반영한다."""
    record = get_record(agreement_id)
    if not record:
        raise ValueError(f"약정을 찾을 수 없습니다: {agreement_id}")
    if not record.get("document_id"):
        return record

    doc = await modusign.fetch_document_fresh(record["document_id"])
    if doc:
        record["status"] = doc.get("status", record["status"])
        if doc.get("completed_at"):
            record["signed_at"] = doc["completed_at"]
        store.upsert("agreements", record)
    return record


def mark_from_webhook(document_id: str, event: str) -> dict | None:
    """웹훅으로 받은 문서 이벤트를 기록에 반영한다."""
    for record in store.read_list("agreements"):
        if record.get("document_id") != document_id:
            continue
        if event == "document_all_signed":
            record["status"] = "COMPLETED"
            record["signed_at"] = datetime.now().isoformat(timespec="seconds")
        elif event == "document_rejected":
            record["status"] = "REJECTED"
        elif event in ("document_request_canceled", "document_signing_canceled"):
            record["status"] = "CANCELED"
        record["last_event"] = event
        store.upsert("agreements", record)
        return record
    return None
