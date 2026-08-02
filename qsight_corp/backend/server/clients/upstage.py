"""Upstage API 클라이언트.

- Document Parse: 업로드한 PDF/스캔본을 마크다운 텍스트로 변환 (W5, W8)
- Information Extract: 파싱된 텍스트에서 구조화 항목 추출 (W5, W7, W8)
- Solar Chat: 개인용 웹 대화형 인터뷰 · 마음 문장 생성 (S1, S2)

UPSTAGE_API_KEY가 없으면 규칙 기반 폴백으로 동작해서 화면 흐름은 그대로
확인할 수 있게 했다. 폴백 결과에는 항상 fallback=True를 표시한다.
"""

from __future__ import annotations

import io
import json
import re
from typing import Any

import httpx

from .. import config

_DOC_PARSE_URL = f"{config.UPSTAGE_API_BASE}/document-digitization"
_CHAT_URL = f"{config.UPSTAGE_API_BASE}/chat/completions"


class UpstageError(RuntimeError):
    pass


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.UPSTAGE_API_KEY}"}


# ── Document Parse ─────────────────────────────────────────
async def document_parse(content: bytes, filename: str) -> dict:
    """문서를 마크다운 텍스트로 변환한다."""
    if not config.upstage_is_available():
        # PDF가 아니면(=이미지·스캔본) 키 없이 글자를 읽을 방법이 아예 없다.
        # 바이트를 긁어봐야 파일 포맷 조각만 나오므로 시도하지 않는다.
        if not content.startswith(b"%PDF-"):
            return {
                "text": "",
                "fallback": True,
                "quality": {"words": 0, "chars": 0, "ratio": 0.0, "readable": False},
                "note": "이미지·스캔 파일은 OCR이 필요합니다. UPSTAGE_API_KEY를 설정해주세요.",
            }

        text = _fallback_text(content)
        quality = text_quality(text)
        return {
            "text": text,
            "fallback": True,
            "quality": quality,
            "note": (
                "PDF에 텍스트 레이어가 없습니다(스캔본으로 보입니다). "
                "OCR이 필요하니 UPSTAGE_API_KEY를 설정해주세요."
                if not quality["readable"]
                else "UPSTAGE_API_KEY가 없어 PDF 텍스트 레이어만 읽었습니다."
            ),
        }

    files = {"document": (filename, content)}
    data = {
        "model": "document-parse",
        "ocr": "auto",
        "output_formats": '["markdown"]',
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        res = await client.post(_DOC_PARSE_URL, headers=_headers(), files=files, data=data)
    if res.status_code >= 400:
        raise UpstageError(f"Document Parse {res.status_code}: {res.text[:300]}")

    payload = res.json()
    text = (payload.get("content") or {}).get("markdown", "")
    if not text:
        # 일부 응답은 elements 배열로만 내려온다.
        text = "\n".join(
            (el.get("content") or {}).get("markdown", "") for el in payload.get("elements", [])
        )
    return {"text": text, "fallback": False, "pages": payload.get("usage", {}).get("pages")}


# ── Information Extract ────────────────────────────────────
async def extract(text: str, schema: dict, instruction: str) -> dict:
    """텍스트에서 schema에 맞는 JSON을 뽑는다.

    Solar의 structured output(json_schema)을 사용한다.
    """
    if not config.upstage_is_available():
        return {"fallback": True, "data": {}}

    body = {
        "model": config.UPSTAGE_SOLAR_MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "너는 문서에서 요청한 항목만 정확히 뽑아내는 추출기다. 문서에 없는 값은 null로 둔다."},
            {"role": "user", "content": f"{instruction}\n\n--- 문서 ---\n{text[:20000]}"},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "extraction", "schema": schema, "strict": True},
        },
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        res = await client.post(_CHAT_URL, headers=_headers(), json=body)
    if res.status_code >= 400:
        raise UpstageError(f"Information Extract {res.status_code}: {res.text[:300]}")

    content = res.json()["choices"][0]["message"]["content"]
    try:
        return {"fallback": False, "data": json.loads(content)}
    except json.JSONDecodeError:
        return {"fallback": False, "data": {}, "raw": content}


# ── Solar Chat ─────────────────────────────────────────────
async def chat(messages: list[dict], temperature: float = 0.4) -> str:
    if not config.upstage_is_available():
        raise UpstageError("UPSTAGE_API_KEY가 설정되지 않았습니다.")
    body = {"model": config.UPSTAGE_SOLAR_MODEL, "messages": messages, "temperature": temperature}
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(_CHAT_URL, headers=_headers(), json=body)
    if res.status_code >= 400:
        raise UpstageError(f"Solar {res.status_code}: {res.text[:300]}")
    return res.json()["choices"][0]["message"]["content"].strip()


# ── 폴백 유틸 ──────────────────────────────────────────────
def _fallback_text(content: bytes) -> str:
    """UPSTAGE_API_KEY가 없을 때 PDF 텍스트 레이어를 읽는 폴백.

    파일 바이트를 문자로 긁는 방식은 쓰지 않는다. PDF 내부 키워드
    (obj, Type, Catalog, endobj …)가 문서 내용처럼 잡혀서, 스캔본을
    "읽었다"고 잘못 판정하게 만들기 때문이다.

    스캔 이미지 PDF는 텍스트 레이어가 없어 빈 문자열이 나온다.
    이 경우는 OCR이 필요하므로 Upstage 키를 넣어야 한다.
    """
    return _pdf_text(content)


def _pdf_text(content: bytes) -> str:
    """pypdf로 PDF 텍스트 레이어를 읽는다. 없거나 실패하면 빈 문자열."""
    if not content.startswith(b"%PDF-"):
        # PDF가 아닌 파일을 넘기면 pypdf가 경고를 쏟아내므로 미리 걸러낸다.
        return ""
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(io.BytesIO(content))
        pages = reader.pages[:10]  # 서식은 앞부분만 봐도 충분하다
        return "\n".join((p.extract_text() or "") for p in pages)
    except Exception:  # noqa: BLE001 - 손상된 PDF여도 폴백은 계속 진행돼야 한다
        return ""


# 사람이 읽을 수 있는 낱말: 한글 2자 이상 또는 영문 3자 이상
_WORD_RE = re.compile(r"[가-힣]{2,}|[A-Za-z]{3,}")
MIN_WORDS = 5
MIN_WORD_RATIO = 0.5


def text_quality(text: str) -> dict:
    """추출된 문자열이 실제 문서 텍스트인지 판별한다.

    이미지 바이트를 문자로 긁어내면 'PNG', 'IHDR', 'IDATx' 같은 조각이 잡혀서
    낱말 수만 세면 통과해버린다. 그래서 낱말이 전체 글자에서 차지하는 비율도 본다.
    진짜 문장은 대부분이 낱말이지만, 바이너리 쓰레기는 기호가 절반을 넘는다.
    """
    body = (text or "").strip()
    words = _WORD_RE.findall(body)
    word_chars = sum(len(w) for w in words)
    total = len(re.sub(r"\s+", "", body)) or 1
    ratio = word_chars / total
    return {
        "words": len(words),
        "chars": word_chars,
        "ratio": round(ratio, 2),
        "readable": len(words) >= MIN_WORDS and ratio >= MIN_WORD_RATIO,
    }


AMOUNT_RE = re.compile(r"([0-9][0-9,]{2,})\s*원")
DATE_RE = re.compile(r"(20\d{2})[.\-년/\s]+(\d{1,2})[.\-월/\s]+(\d{1,2})")


def guess_amount(text: str) -> int | None:
    """증빙에서 금액을 규칙 기반으로 추정한다(폴백 및 교차검증용)."""
    matches = [int(m.replace(",", "")) for m in AMOUNT_RE.findall(text)]
    return max(matches) if matches else None


def guess_date(text: str) -> str | None:
    m = DATE_RE.search(text)
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
