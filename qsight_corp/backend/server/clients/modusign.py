"""모두싸인(Modusign) API 클라이언트.

실제 REST 호출 경로는 이 파일 한 곳에만 모아 두었다.
모두싸인 계정을 발급받은 뒤 응답 필드가 다르면 `_normalize_document`와
`_ENDPOINTS`만 고치면 나머지 화면/집계 코드는 손대지 않아도 된다.

인증: Authorization: Basic base64("{이메일}:{API Key}")

자격증명이 없으면 mock_data 기반 데모 모드로 동작한다.
"""

from __future__ import annotations

import asyncio
import base64
import copy
import logging
import time
from datetime import date, datetime
from typing import Any

import httpx

from .. import config, store
from . import mock_data

log = logging.getLogger("qsight.modusign")

# 문서 목록 캐시 수명(초). 여러 화면이 같은 목록을 재사용해 호출 수를 줄인다.
DOCUMENTS_TTL = 60.0
# 429를 만났을 때 재시도 횟수
RATE_LIMIT_RETRIES = 2

# 모두싸인 REST 경로 모음. (실제 스펙과 다르면 여기만 수정)
#
# [검증됨] 2026-07-30 실계정으로 라우트 존재를 확인한 경로.
#   판별법: 403/400 = 라우트 있음(권한·리소스 문제), 404 "Cannot GET" = 라우트 없음
# [미검증] POST 전용이라 GET으로 존재 여부를 확인할 수 없는 경로.
#   실제로 호출해 보기 전까지 맞다고 단정하면 안 된다.
_ENDPOINTS = {
    # ── 검증됨 ──────────────────────────────────────────
    "documents": "/documents",                                   # 200 확인 · 서명 요청 생성(POST)도 여기
    "document": "/documents/{document_id}",                      # 403(존재)
    "document_histories": "/documents/{document_id}/histories",  # 403(존재)
    "document_file": "/documents/{document_id}/file",            # 400(존재)
    "templates": "/templates",                                   # 200 확인
    "template": "/templates/{template_id}",                      # 403(존재)
    "webhooks": "/webhooks",                                     # 200 확인

    # ── 미검증 (POST 전용이라 GET으로 확인 불가) ────────
    "remind": "/documents/{document_id}/participants/{participant_id}/remind",
}

# 파일 내려받기는 /documents/{id}/file 을 그냥 부르면 400이 난다(2026-07-31 확인).
#   {"property":"signedUrlToken","message":"signedUrlToken should not be empty"}
# 토큰을 우리가 만들 수는 없고, 문서 응답(목록·상세 모두)에 이미 완성된 presigned URL이
# 들어 있다. 그래서 파일은 항상 "문서를 읽어서 → 그 안의 downloadUrl을 그대로 GET" 한다.
#
#   raw["file"]["downloadUrl"]        → 서명 완료 약정서 PDF
#   raw["auditTrail"]["downloadUrl"]  → 감사 추적 인증서 PDF (별도 파일이다)
#
# presigned URL이라 Authorization 헤더 없이도 받아지고, 유효 시간이 짧아서
# 캐시해 두면 안 된다. 누를 때마다 문서를 다시 읽어 새 URL을 받는다.
FILE_KINDS = {
    "agreement": ("file", "서명 완료 약정서"),
    "audit_trail": ("auditTrail", "감사 추적 인증서"),
}

# 모두싸인이 문서 하나에 받아주는 metadatas 최대 개수(공식 문서 기준).
# 기부 정보 키가 딱 이 개수라 새 키를 넣으려면 기존 키를 빼야 한다.
METADATA_LIMIT = 10

# 웹훅으로 받을 수 있는 이벤트(공식 문서 기준). 전부 '문서' 이벤트이고
# 템플릿 저장 이벤트는 없다. 응답이 2xx가 아니거나 10초를 넘기면 최대 5회 재시도한다.
WEBHOOK_EVENTS = [
    "document_started",
    "document_signed",
    "document_all_signed",
    "document_rejected",
    "document_request_canceled",
    "document_signing_canceled",
    "document_modification_started",
    "document_modification_completed",
    "document_modification_approval_requested",
    "document_modification_canceled",
]

# 모두싸인 문서 상태 → 화면 표기
STATUS_LABELS = {
    "COMPLETED": "체결 완료",
    "ON_GOING": "서명 대기",
    "REJECTED": "서명 거절",
    "EXPIRED": "기한 만료",
    "CANCELED": "취소됨",
    "DRAFT": "작성 중",
}

# 문서 이력 action → W4 타임라인 태그 (w4_detail.js의 TAG_TONE과 같은 말을 쓴다)
HISTORY_TAGS = {
    "START_SIGNING_REQUEST": "발송",
    "SIGNING_REQUEST": "발송",
    "FIRST_READING_DOCUMENT_IN_SIGNING_TURN": "열람",
    "READING_DOCUMENT": "열람",
    "SIGNING_COMPLETED": "완료",
    "SIGNING_COMPLETED_ALL": "완료",
    "SIGNING_REJECTED": "거절",
    "SIGNING_CANCELED": "거절",
    "REQUEST_CANCELED": "거절",
}


class ModusignError(RuntimeError):
    pass


class ModusignClient:
    def __init__(self) -> None:
        self.mock = config.modusign_is_mock()
        self.base = config.MODUSIGN_API_BASE
        self._dataset: dict | None = None
        # 문서 목록 캐시. 화면마다 /documents를 새로 부르면 바로 429가 난다.
        self._documents_cache: tuple[float, list[dict]] | None = None
        self._documents_lock = asyncio.Lock()

    # ── 공통 ────────────────────────────────────────────────
    @property
    def auth_header(self) -> str:
        raw = f"{config.MODUSIGN_EMAIL}:{config.MODUSIGN_API_KEY}".encode()
        return "Basic " + base64.b64encode(raw).decode()

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        headers = {
            "Authorization": self.auth_header,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        headers.update(kwargs.pop("headers", {}))
        url = f"{self.base}{path}"

        # 429는 잠깐 기다리면 풀리므로 Retry-After를 보고 재시도한다.
        for attempt in range(RATE_LIMIT_RETRIES + 1):
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.request(method, url, headers=headers, **kwargs)

            if res.status_code == 429 and attempt < RATE_LIMIT_RETRIES:
                wait = _retry_after(res, attempt)
                log.warning("모두싸인 429 — %.1f초 후 재시도 (%s)", wait, path)
                await asyncio.sleep(wait)
                continue

            if res.status_code >= 400:
                raise ModusignError(f"모두싸인 API {res.status_code}: {res.text[:300]}")
            if res.headers.get("content-type", "").startswith("application/json"):
                return res.json()
            return res.content

        raise ModusignError("모두싸인 API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.")

    def invalidate_documents(self) -> None:
        """문서 상태를 바꾼 뒤 캐시를 버린다(리마인드, 이행 확정 등)."""
        self._documents_cache = None

    # ── 데모 데이터 ─────────────────────────────────────────
    def _mock_dataset(self) -> dict:
        """생성된 데모 데이터를 프로세스 수명 동안 캐시한다.

        리마인드 발송처럼 상태가 바뀌는 액션은 data/doc_overrides.json에
        누적해서 서버를 재시작해도 유지되도록 했다.
        """
        if self._dataset is None:
            self._dataset = mock_data.build_dataset(date.today())
        data = copy.deepcopy(self._dataset)
        overrides = store.read("doc_overrides", {})
        if isinstance(overrides, dict) and overrides:
            for doc in data["documents"]:
                patch = overrides.get(doc["id"])
                if patch:
                    doc.update(patch)
        return data

    def _mock_patch(self, document_id: str, patch: dict) -> None:
        overrides = store.read("doc_overrides", {})
        if not isinstance(overrides, dict):
            overrides = {}
        overrides[document_id] = {**overrides.get(document_id, {}), **patch}
        store.write("doc_overrides", overrides)

    # ── 문서 ────────────────────────────────────────────────
    async def list_documents(self) -> list[dict]:
        """기관의 모든 약정 문서를 정규화된 형태로 반환한다.

        W1~W9가 모두 이 목록을 쓰기 때문에 매번 API를 부르면 곧바로
        429(rate limit)에 걸린다. TTL 캐시로 한 번만 받아 공유한다.
        """
        if self.mock:
            return self._mock_dataset()["documents"]

        cached = self._fresh_cache()
        if cached is not None:
            return cached

        # 동시에 들어온 요청이 각자 API를 부르지 않도록 잠근다.
        async with self._documents_lock:
            cached = self._fresh_cache()
            if cached is not None:
                return cached

            documents: list[dict] = []
            page = 1
            while True:
                payload = await self._request(
                    "GET", _ENDPOINTS["documents"], params={"page": page, "per_page": 100}
                )
                rows = payload.get("documents") or payload.get("data") or []
                documents.extend(_normalize_document(r) for r in rows)
                # 실제 응답은 {"count": int, "documents": [...]} 형태다(2026-07 확인).
                total = payload.get("count") or payload.get("totalCount") or payload.get("total") or 0
                if not rows or len(documents) >= total:
                    break
                page += 1

            self._documents_cache = (time.monotonic(), documents)
            return documents

    def _fresh_cache(self) -> list[dict] | None:
        if not self._documents_cache:
            return None
        cached_at, documents = self._documents_cache
        if time.monotonic() - cached_at > DOCUMENTS_TTL:
            return None
        return documents

    async def get_document(self, document_id: str) -> dict | None:
        if self.mock:
            for doc in self._mock_dataset()["documents"]:
                if doc["id"] == document_id:
                    return doc
            return None

        # 목록 캐시에 있으면 재사용해서 호출 수를 아낀다.
        for doc in self._fresh_cache() or []:
            if doc["id"] == document_id:
                return doc

        payload = await self._request("GET", _ENDPOINTS["document"].format(document_id=document_id))
        return _normalize_document(payload)

    async def fetch_document_fresh(self, document_id: str) -> dict | None:
        """캐시를 건너뛰고 모두싸인에서 문서를 다시 읽는다(W4 실시간 상태 조회).

        서명 상태는 기부자가 언제든 바꾸므로, 담당자가 확인 버튼을 눌렀을 때는
        60초 캐시를 무시하고 최신 값을 보여줘야 한다.
        """
        if self.mock:
            return await self.get_document(document_id)
        payload = await self._request("GET", _ENDPOINTS["document"].format(document_id=document_id))
        self.invalidate_documents()
        return _normalize_document(payload)

    async def get_histories(self, document_id: str) -> list[dict]:
        """W4 진행 타임라인용 문서 이력.

        실제 응답은 {"histories": [{message, timestamp, action, generator}]} 형태다.
        (2026-07-31 확인 — createdAt/description 같은 필드는 없다.)
        """
        if self.mock:
            doc = await self.get_document(document_id)
            return doc.get("history", []) if doc else []
        payload = await self._request(
            "GET", _ENDPOINTS["document_histories"].format(document_id=document_id)
        )
        rows = payload.get("histories") or payload.get("data") or []
        out = []
        for r in rows:
            action = r.get("action") or ""
            stamp = r.get("timestamp") or ""
            out.append({
                "date": stamp[:10],
                "time": stamp[11:16],
                "event": r.get("message") or action,
                "tag": HISTORY_TAGS.get(action, "기록"),
            })
        return out

    async def remind(self, document_id: str, participant_id: str | None = None) -> dict:
        """W2 미서명자 재발송(리마인드)."""
        if self.mock:
            now = datetime.now().isoformat(timespec="seconds")
            self._mock_patch(document_id, {"last_reminded_at": now})
            return {"ok": True, "document_id": document_id, "reminded_at": now, "mock": True}

        doc = await self.get_document(document_id)
        targets = [
            p for p in (doc.get("participants", []) if doc else [])
            if p.get("status") != "SIGNED" and (participant_id is None or p["id"] == participant_id)
        ]
        for p in targets:
            await self._request(
                "POST",
                _ENDPOINTS["remind"].format(document_id=document_id, participant_id=p["id"]),
            )
        # 재발송으로 문서 상태가 바뀌므로 캐시를 버린다.
        self.invalidate_documents()
        return {"ok": True, "document_id": document_id, "count": len(targets)}

    async def file_urls(self, document_id: str) -> dict[str, str]:
        """약정서·감사 추적 인증서의 내려받기 URL을 새로 받아온다.

        presigned URL이라 유효 시간이 짧다. 저장하지 말고 필요할 때마다 부를 것.
        """
        if self.mock:
            raise ModusignError("데모 모드에서는 실제 PDF가 없습니다.")
        raw = await self._request("GET", _ENDPOINTS["document"].format(document_id=document_id))
        urls = {}
        for key, (field, _label) in FILE_KINDS.items():
            url = (raw.get(field) or {}).get("downloadUrl")
            if url:
                urls[key] = url
        if not urls:
            raise ModusignError("이 문서에는 내려받을 수 있는 파일이 없습니다. 서명이 끝났는지 확인해주세요.")
        return urls

    async def download_file(self, document_id: str, kind: str = "agreement") -> bytes:
        """PDF 본문을 내려받는다(W4 증빙 팩 zip에 담을 때 사용).

        kind: "agreement" 서명 완료 약정서 · "audit_trail" 감사 추적 인증서
        """
        urls = await self.file_urls(document_id)
        url = urls.get(kind)
        if not url:
            label = FILE_KINDS.get(kind, (None, kind))[1]
            raise ModusignError(f"{label}를 찾을 수 없습니다.")
        # presigned URL이라 Authorization 헤더를 붙이지 않는다.
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http:
            res = await http.get(url)
        if res.status_code >= 400:
            raise ModusignError(f"파일 내려받기 실패 {res.status_code}")
        return res.content

    # ── 템플릿 ──────────────────────────────────────────────
    async def list_templates(self) -> list[dict]:
        if self.mock:
            return self._mock_dataset()["templates"]
        payload = await self._request("GET", _ENDPOINTS["templates"])
        rows = payload.get("templates") or payload.get("data") or []
        return [
            {
                "id": r.get("id"),
                "name": r.get("title") or r.get("name"),
                "updated_at": (r.get("updatedAt") or "")[:10],
                "fields": _normalize_fields(r),
            }
            for r in rows
        ]

    async def request_signature(
        self,
        title: str,
        pdf_base64: str,
        signer: dict,
        metadatas: dict | None = None,
        anchor_text: str = "(서명)",
    ) -> dict:
        """완성된 약정서 PDF로 전자서명을 요청한다.

        POST /documents — 템플릿 없이 PDF를 그대로 올리는 방식이다.
        서명란 위치는 PDF 본문의 anchor_text(기본 "(서명)")를 찾아 그 옆에 놓는다.
        템플릿을 쓰지 않으므로 templateId를 회수할 필요가 없다.

        metadatas의 키는 `_normalize_document`가 읽는 키와 같아야 기관 화면
        집계가 맞는다. 모두싸인은 metadatas를 최대 10개까지만 받는다.

        ⚠️ 이 호출은 서명자에게 실제로 이메일을 보낸다.
        """
        if self.mock:
            doc_id = store.next_id("signature_requests", "req")
            record = {
                "id": doc_id,
                "title": title,
                "signer": signer,
                "metadatas": metadatas or {},
                "status": "ON_GOING",
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "mock": True,
            }
            store.append("signature_requests", record)
            return record

        meta = list((metadatas or {}).items())[:METADATA_LIMIT]
        body = {
            "title": title[:100],  # 문서 제목은 1~100자
            "file": {"base64": pdf_base64, "extension": "pdf"},
            "participants": [
                {
                    "name": signer.get("name"),
                    "signingOrder": 1,
                    "signingMethod": {"type": "EMAIL", "value": signer.get("email")},
                    "fields": [
                        {
                            "type": "SIGNATURE",
                            "required": True,
                            "signatureTypes": ["SIGN", "STAMP"],
                            "position": {"anchor": {"text": anchor_text, "offset": {"x": 0.02, "y": 0}}},
                            "size": {"width": 0.18, "height": 0.06},
                        }
                    ],
                }
            ],
            "metadatas": [{"key": k, "value": str(v)} for k, v in meta],
        }
        payload = await self._request("POST", _ENDPOINTS["documents"], json=body)
        self.invalidate_documents()
        return {
            "id": payload.get("id"),
            "status": payload.get("status", "ON_GOING"),
            "raw": payload,
        }


def _retry_after(res: httpx.Response, attempt: int) -> float:
    """429 응답의 Retry-After를 읽고, 없으면 지수 백오프로 대기 시간을 정한다."""
    header = res.headers.get("Retry-After")
    if header:
        try:
            return min(float(header), 30.0)
        except ValueError:
            pass
    return min(2.0 * (2 ** attempt), 30.0)


# ── 응답 정규화 ────────────────────────────────────────────
def _meta(raw: dict) -> dict:
    """모두싸인 metadatas(list) → dict."""
    out: dict[str, str] = {}
    for m in raw.get("metadatas") or []:
        if isinstance(m, dict) and "key" in m:
            out[m["key"]] = m.get("value", "")
    return out


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return default


def _normalize_document(raw: dict) -> dict:
    """모두싸인 문서 응답을 앱 내부 스키마로 맞춘다.

    금액·주기·사업 같은 기부 정보는 문서 생성 시 metadatas에 넣어 두고
    여기서 다시 꺼내 쓴다.
    """
    meta = _meta(raw)

    # 서명 시각은 participants가 아니라 별도의 signings 배열에 들어온다(2026-07-31 확인).
    # 이걸 안 합치면 체결 완료 문서도 전부 "미서명"으로 보인다.
    signed_at_by_participant = {
        s.get("participantId"): s.get("signedAt")
        for s in (raw.get("signings") or [])
        if s.get("participantId")
    }
    doc_status = raw.get("status", "ON_GOING")

    participants = []
    for p in raw.get("participants") or []:
        name = p.get("name", "")
        method = p.get("signingMethod") or {}
        signed_at = signed_at_by_participant.get(p.get("id")) or p.get("signedAt")
        if signed_at:
            status = "SIGNED"
        elif doc_status == "REJECTED":
            status = "REJECTED"
        else:
            status = p.get("status") or "SENT"
        participants.append({
            "id": p.get("id"),
            "name": name,
            "role": p.get("role", "기부자"),
            "email": method.get("value") if method.get("type") == "EMAIL" else p.get("email"),
            "phone": method.get("value") if method.get("type") != "EMAIL" else p.get("phone"),
            "status": status,
            # 열람 시각은 문서 응답에 없다. 이력(histories)에만 남으므로 W4에서 따로 읽는다.
            "viewed_at": p.get("viewedAt"),
            "signed_at": signed_at,
        })

    donor = participants[0] if participants else {"name": ""}
    # completedAt 필드는 응답에 없다. 마지막 서명 시각을 체결 시각으로 쓴다.
    completed_at = raw.get("completedAt") or (
        max(signed_at_by_participant.values()) if signed_at_by_participant else None
    )
    start_date = meta.get("start_date") or (raw.get("createdAt") or "")[:10]
    term_months = _to_int(meta.get("term_months"), 12)

    return {
        "id": raw.get("id"),
        "title": raw.get("title", ""),
        "template_id": raw.get("templateId"),
        "status": doc_status,
        "requested_at": (raw.get("createdAt") or "")[:10],
        "completed_at": (completed_at or "")[:10] or None,
        "expires_at": meta.get("end_date") or (raw.get("expiresAt") or "")[:10] or None,
        "donor": {
            "id": meta.get("donor_id") or donor.get("id"),
            "name": donor.get("name", ""),
            "email": donor.get("email"),
            "phone": donor.get("phone"),
        },
        "donation": {
            "type": meta.get("donation_type", "일시"),
            "amount": _to_int(meta.get("amount")),
            "frequency": meta.get("frequency", "일시"),
            "term_months": term_months,
            "program_id": meta.get("program_id", ""),
            "program_name": meta.get("program_name", ""),
            "start_date": start_date,
            "end_date": meta.get("end_date", ""),
            "receipt_required": meta.get("receipt_required", "true") == "true",
            "motivation": meta.get("motivation", ""),
        },
        "participants": participants,
        # 어떤 증빙 파일이 실제로 존재하는지. URL 자체는 유효 시간이 짧아 화면에 내려보내지
        # 않고, 눌렀을 때 서버가 문서를 다시 읽어 새 URL을 받는다(W4 원본 열기).
        "files": {
            key: bool((raw.get(field) or {}).get("downloadUrl"))
            for key, (field, _label) in FILE_KINDS.items()
        },
        # 이행 회차·증빙은 기관 로컬 저장소에서 병합한다(services/fulfillment.py).
        "installments": [],
        "amendment": None,
        "history": [],
    }


def _normalize_fields(raw: dict) -> list[dict]:
    fields = []
    for p in raw.get("participants") or []:
        for f in p.get("participantFields") or p.get("fields") or []:
            fields.append({
                "key": f.get("dataLabel") or f.get("id"),
                "label": f.get("name") or f.get("dataLabel", ""),
                "type": (f.get("type") or "TEXT").lower(),
                "assignee": p.get("role", "기부자"),
            })
    return fields




# 앱 전역에서 재사용하는 단일 인스턴스
client = ModusignClient()
