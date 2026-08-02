"""W5 서식 항목 추출 · W7 공고문 자동 채우기.

Document Parse로 텍스트를 얻고 Information Extract로 구조화한다.
UPSTAGE_API_KEY가 없으면 규칙 기반 폴백이 동작하도록 해서, 키 없이도
"업로드 → 항목 확인 → 서명란 배치" 흐름 전체를 눌러볼 수 있다.
"""

from __future__ import annotations

import re

from ..clients import upstage

# ── W5: 서식에서 입력 항목 뽑기 ─────────────────────────────
FORM_SCHEMA = {
    "type": "object",
    "properties": {
        "form_title": {"type": ["string", "null"], "description": "서식 제목"},
        "fields": {
            "type": "array",
            "description": "서식에 있는 입력 항목",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "description": "항목명 (예: 기부자 성명)"},
                    "type": {
                        "type": "string",
                        "enum": ["text", "number", "select", "check", "textarea", "date", "sign"],
                        "description": "입력 형태. 서명란이면 sign.",
                    },
                    "assignee": {
                        "type": "string",
                        "enum": ["기부자", "담당자", "입회인"],
                        "description": "누가 채우는 항목인지",
                    },
                },
                "required": ["label", "type", "assignee"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["form_title", "fields"],
    "additionalProperties": False,
}

# 폴백에서 찾을 흔한 서식 항목
_COMMON_FIELDS = [
    (r"성\s*명|이\s*름|기부자명", "기부자 성명", "text", "기부자"),
    (r"연락처|휴대전화|전화번호", "연락처", "text", "기부자"),
    (r"이메일|e-?mail", "이메일", "text", "기부자"),
    (r"주\s*소", "주소", "text", "기부자"),
    (r"생년월일|주민등록번호", "생년월일", "date", "기부자"),
    (r"대상\s*사업|사업\s*명|후원\s*사업", "대상 사업", "select", "담당자"),
    (r"기부\s*금액|후원\s*금액|회차\s*금액|월\s*금액", "회차 금액", "number", "기부자"),
    (r"납부\s*주기|결제\s*주기|주\s*기", "납부 주기", "select", "기부자"),
    (r"약정\s*기간|후원\s*기간|기\s*간", "약정 기간", "number", "기부자"),
    (r"납부\s*방법|결제\s*수단|자동이체", "납부 방법", "select", "기부자"),
    (r"개인정보.*필수|필수.*동의", "개인정보(필수)", "check", "기부자"),
    (r"개인정보.*선택|선택.*동의", "개인정보(선택)", "check", "기부자"),
    (r"기부\s*동기|남기고\s*싶은|한\s*마디", "기부 동기", "textarea", "기부자"),
    (r"영수증", "기부금영수증 발급", "check", "기부자"),
    (r"서\s*명|사\s*인|날\s*인", "서명란 · 기부자", "sign", "기부자"),
]


async def parse_form(content: bytes, filename: str) -> dict:
    parsed = await upstage.document_parse(content, filename)
    text = parsed.get("text", "")
    quality = parsed.get("quality") or upstage.text_quality(text)
    title = filename.rsplit(".", 1)[0]

    # 문서를 못 읽었으면 항목을 지어내지 않는다.
    # 그럴듯한 기본 서식을 돌려주면 담당자가 "이 문서에서 뽑힌 항목"으로 착각한다.
    if not quality["readable"]:
        return {
            "form_title": title,
            "filename": filename,
            "fields": [],
            "field_count": 0,
            "fallback": True,
            "readable": False,
            "reason": parsed.get("note") or "문서에서 읽을 수 있는 텍스트를 찾지 못했습니다.",
            # 담당자가 직접 시작하고 싶을 때만 쓰라고 따로 내려준다.
            "suggested_fields": _default_fields(),
            "text_preview": text[:200],
            "quality": quality,
        }

    fields: list[dict] = []
    fallback = True

    if not parsed.get("fallback"):
        result = await upstage.extract(
            text,
            FORM_SCHEMA,
            "이 서식(기부 약정서/후원 신청서)에 있는 입력 항목을 빠짐없이 뽑아줘. "
            "서명·날인 자리는 type을 sign으로 표시해줘.",
        )
        data = result.get("data") or {}
        fields = data.get("fields") or []
        title = data.get("form_title") or title
        fallback = result.get("fallback", False) or not fields

    # 항목마다 어디서 나온 값인지 표시한다.
    #   upstage = 서식 원문에서 추출  /  rule = 원문에 있는 낱말을 규칙으로 매칭
    #   default = 원문을 못 읽어 기본 서식으로 채움  /  added = 우리가 보강한 항목
    for f in fields:
        f.setdefault("source", "upstage")

    if not fields:
        fields = _fallback_fields(text)

    # 서명란이 하나도 없으면 최소 기부자 서명은 추가한다.
    if not any(f.get("type") == "sign" for f in fields):
        fields.append({"label": "서명란 · 기부자", "type": "sign", "assignee": "기부자", "source": "added"})
    fields.append({"label": "서명란 · 담당자", "type": "sign", "assignee": "담당자", "source": "added"})

    # 중복 라벨 제거 + key 부여
    seen: set[str] = set()
    normalized = []
    for i, f in enumerate(fields):
        label = (f.get("label") or "").strip()
        if not label or label in seen:
            continue
        seen.add(label)
        normalized.append({
            "key": _slug(label, i),
            "label": label,
            "type": f.get("type", "text"),
            "assignee": f.get("assignee", "기부자"),
            "source": f.get("source", "upstage"),
            "placed": False,
        })

    return {
        "form_title": title,
        "filename": filename,
        "fields": normalized,
        "field_count": len(normalized),
        "fallback": fallback,
        "readable": True,
        "quality": quality,
        "text_preview": text[:800],
    }


def _fallback_fields(text: str) -> list[dict]:
    """원문에 실제로 등장한 낱말만 규칙으로 매칭한다.

    하나도 못 찾으면 빈 목록을 돌려준다. 기본 서식으로 채우면
    문서에서 뽑은 항목처럼 보이기 때문이다(_default_fields는 명시적으로만 사용).
    """
    found = []
    for pattern, label, ftype, assignee in _COMMON_FIELDS:
        if re.search(pattern, text, re.IGNORECASE):
            found.append({"label": label, "type": ftype, "assignee": assignee, "source": "rule"})
    return found


def _default_fields() -> list[dict]:
    """문서를 못 읽었을 때 담당자가 직접 고를 수 있는 표준 기부 약정 서식."""
    return [
        {"key": _slug(label, i), "label": label, "type": ftype,
         "assignee": assignee, "source": "default", "placed": False}
        for i, (_, label, ftype, assignee) in enumerate(_COMMON_FIELDS[:10])
    ]


def _slug(label: str, index: int) -> str:
    ascii_only = re.sub(r"[^a-zA-Z0-9]+", "_", label).strip("_").lower()
    return ascii_only or f"field_{index + 1}"


# ── W7: 공고문에서 사업 정보 뽑기 ───────────────────────────
PROGRAM_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": ["string", "null"], "description": "모금 사업명"},
        "goal_amount": {"type": ["integer", "null"], "description": "목표 금액(원)"},
        "start_date": {"type": ["string", "null"], "description": "모금 시작일 YYYY-MM-DD"},
        "end_date": {"type": ["string", "null"], "description": "모금 종료일 YYYY-MM-DD"},
        "methods": {
            "type": "array",
            "description": "받는 방식",
            "items": {"type": "string", "enum": ["정기", "일시", "봉사", "유산"]},
        },
        "reward": {"type": ["string", "null"], "description": "답례품"},
        "description": {"type": ["string", "null"], "description": "사업 요약 2문장 이내"},
        "tags": {
            "type": "array",
            "description": "기부자 매칭에 쓸 추천 태그 3~6개(지역/주제/방식)",
            "items": {"type": "string"},
        },
    },
    "required": ["name", "goal_amount", "start_date", "end_date", "methods", "reward", "description", "tags"],
    "additionalProperties": False,
}

_TAG_HINTS = {
    "문화재": ["문화재", "유형문화재", "성곽", "사찰", "고택"],
    "근대유산": ["근대", "건축물", "적산가옥"],
    "생활유산": ["전통시장", "골목", "구술", "생활사"],
    "교육": ["교육", "체험", "청소년", "학생", "교실"],
    "아카이브": ["기록", "아카이브", "스캔", "사진"],
    "봉사": ["봉사", "자원봉사", "참여"],
    "정기": ["정기", "매월", "월정액"],
}


async def parse_notice(content: bytes, filename: str) -> dict:
    """모금 공고문 PDF/HWP 텍스트에서 등록 폼 값을 뽑는다."""
    parsed = await upstage.document_parse(content, filename)
    text = parsed.get("text", "")

    data: dict = {}
    fallback = True
    if not parsed.get("fallback"):
        result = await upstage.extract(
            text,
            PROGRAM_SCHEMA,
            "이 모금 공고문에서 사업명, 목표 금액, 모금 기간, 받는 방식, 답례품, 요약, 추천 태그를 뽑아줘.",
        )
        data = result.get("data") or {}
        fallback = result.get("fallback", False)

    # 빈 칸 규칙 기반 보완
    if not data.get("goal_amount"):
        data["goal_amount"] = upstage.guess_amount(text)
    if not data.get("start_date"):
        data["start_date"] = upstage.guess_date(text)
    if not data.get("name"):
        data["name"] = filename.rsplit(".", 1)[0]
    if not data.get("tags"):
        data["tags"] = suggest_tags(f"{data.get('name', '')} {data.get('description', '')} {text[:2000]}")
    if not data.get("methods"):
        data["methods"] = ["정기", "일시"]

    return {"filename": filename, "data": data, "fallback": fallback, "text_preview": text[:800]}


def suggest_tags(text: str, limit: int = 6) -> list[str]:
    """규칙 기반 추천 태그. 공고문이 없어도 사업명만으로 동작한다."""
    tags = []
    for tag, hints in _TAG_HINTS.items():
        if any(h in text for h in hints):
            tags.append(tag)
    for gu in re.findall(r"(부산\s*[가-힣]{1,3}구|[가-힣]{2,4}구)", text):
        cleaned = gu.replace(" ", "")
        if cleaned not in tags:
            tags.append(cleaned if cleaned.startswith("부산") else f"부산 {cleaned}")
    return tags[:limit]
