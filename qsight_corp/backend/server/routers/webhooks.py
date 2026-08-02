"""모두싸인 웹훅 수신.

모두싸인 웹 > 설정 > API > Webhook 에서 이 주소를 등록한다.
    POST https://<공개주소>/api/webhooks/modusign

⚠️ 공인 URL이 필요하므로 localhost에서는 동작하지 않는다.
   배포하거나 ngrok 같은 터널을 열어야 실제로 호출을 받는다.
   그 전까지는 /api/public/agreements/{id} 폴링으로 상태를 확인한다.

⚠️ 모두싸인은 응답이 2xx가 아니거나 처리가 10초를 넘으면 최대 5회 재시도한다.
   그래서 이 핸들러는 검증만 하고 바로 2xx를 돌려준 뒤,
   실제 처리는 백그라운드로 넘긴다. 안 그러면 같은 약정이 다섯 번 처리된다.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Request

from ..clients.modusign import WEBHOOK_EVENTS
from ..clients.modusign import client as modusign
from ..services import agreements

log = logging.getLogger("qsight.webhook")

router = APIRouter(prefix="/api/webhooks", tags=["웹훅"])


@router.post("/modusign")
async def modusign_webhook(request: Request, background: BackgroundTasks):
    """문서 이벤트를 받아 약정 상태를 갱신한다."""
    try:
        payload = await request.json()
    except ValueError:
        # 본문이 깨져도 재시도를 부르지 않도록 2xx로 닫는다.
        log.warning("모두싸인 웹훅: JSON이 아닌 본문")
        return {"ok": True, "ignored": "invalid_json"}

    event = payload.get("event") or payload.get("type") or ""
    document_id = (
        payload.get("documentId")
        or payload.get("document_id")
        or (payload.get("document") or {}).get("id")
    )

    if event not in WEBHOOK_EVENTS:
        log.info("모두싸인 웹훅: 처리하지 않는 이벤트 %s", event)
        return {"ok": True, "ignored": event}
    if not document_id:
        log.warning("모두싸인 웹훅: documentId 없음 (event=%s)", event)
        return {"ok": True, "ignored": "no_document_id"}

    # 서명이 안 붙은 웹훅이라 본문만 믿을 수 없다. 실제 처리는 뒤에서 하되
    # 모두싸인에서 문서를 다시 읽어 진짜 그 상태인지 확인한다.
    background.add_task(_apply, document_id, event)
    return {"ok": True, "event": event, "document_id": document_id}


async def _apply(document_id: str, event: str) -> None:
    """백그라운드 처리 — 응답을 이미 보낸 뒤에 실행된다."""
    try:
        doc = await modusign.fetch_document_fresh(document_id)
    except Exception as e:  # noqa: BLE001 - 웹훅 처리 실패가 서버를 죽이면 안 된다
        log.warning("웹훅 확인 실패 %s: %s", document_id, e)
        return

    if not doc:
        log.warning("웹훅: 모두싸인에 없는 문서 %s", document_id)
        return

    record = agreements.mark_from_webhook(document_id, event)
    if record:
        log.info("웹훅 반영: %s → %s (%s)", record["id"], record["status"], event)
    else:
        # 개인용 웹을 거치지 않고 만든 문서일 수 있다. 캐시만 비우면 화면은 갱신된다.
        log.info("웹훅: 로컬 약정 기록 없음 (문서 %s). 캐시만 갱신", document_id)
