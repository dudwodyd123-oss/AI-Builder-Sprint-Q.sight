"""모두싸인 실 연동 진단 스크립트.

qsight/.env의 자격증명으로 모두싸인 API에 붙어서
1) 인증이 되는지, 2) 각 엔드포인트 경로가 맞는지, 3) 응답 필드가
`_normalize_document`가 기대하는 모양인지 확인한다.

**읽기(GET)만 호출한다.** 리마인드 재발송·문서 발송·템플릿 생성처럼
기부자에게 실제로 영향이 가는 요청은 절대 보내지 않는다.

API 키는 화면에 출력하지 않고, 기부자 개인정보도 마스킹해서 보여준다.

실행:
    python tools/check_modusign.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import config  # noqa: E402
from server.clients import modusign  # noqa: E402

OK = "  [OK]"
NG = "  [!!]"


def mask(value: object, keep: int = 1) -> str:
    """개인정보는 앞 글자만 남긴다."""
    text = str(value or "")
    if not text:
        return "(빈 값)"
    if len(text) <= keep:
        return text + "○"
    return text[:keep] + "○" * min(len(text) - keep, 6)


def summarize(payload: object, depth: int = 0) -> str:
    """응답의 '모양'만 보여준다(값은 타입/길이로 대체)."""
    pad = "  " * depth
    if isinstance(payload, dict):
        lines = []
        for key, value in list(payload.items())[:20]:
            if isinstance(value, (dict, list)):
                lines.append(f"{pad}  {key}: {type(value).__name__}")
                if depth < 1:
                    lines.append(summarize(value, depth + 1))
            else:
                lines.append(f"{pad}  {key}: {type(value).__name__}")
        return "\n".join(l for l in lines if l)
    if isinstance(payload, list):
        if not payload:
            return f"{pad}  (빈 배열)"
        return f"{pad}  [{len(payload)}건] 첫 항목:\n" + summarize(payload[0], depth + 1)
    return f"{pad}  {type(payload).__name__}"


async def probe(client: httpx.AsyncClient, name: str, path: str) -> tuple[int, object]:
    """GET 한 번 호출하고 상태코드와 본문을 돌려준다."""
    try:
        res = await client.get(path)
    except httpx.HTTPError as e:
        print(f"{NG} {name:22} {path}  →  연결 실패: {e}")
        return 0, None

    mark = OK if res.status_code < 400 else NG
    print(f"{mark} {name:22} {path}  →  {res.status_code}")
    if res.status_code >= 400:
        print(f"       응답: {res.text[:200]}")
        return res.status_code, None
    try:
        return res.status_code, res.json()
    except ValueError:
        return res.status_code, res.content


async def main() -> int:
    print("=" * 72)
    print("모두싸인 실 연동 진단")
    print("=" * 72)

    # ── 1. 설정 확인 (키 값은 출력하지 않는다) ──────────────
    print("\n[1] 설정")
    print(f"  API BASE : {config.MODUSIGN_API_BASE}")
    print(f"  EMAIL    : {mask(config.MODUSIGN_EMAIL, keep=2)}")
    print(f"  API KEY  : {'설정됨 (' + str(len(config.MODUSIGN_API_KEY)) + '자)' if config.MODUSIGN_API_KEY else '비어 있음'}")

    if config.modusign_is_mock():
        print(f"\n{NG} 데모 모드입니다. qsight/.env에 아래 두 값을 채운 뒤 다시 실행하세요.")
        print("       MODUSIGN_EMAIL=모두싸인 계정 이메일")
        print("       MODUSIGN_API_KEY=발급받은 API Key")
        print("       (MODUSIGN_FORCE_MOCK=0 인지도 확인하세요)")
        return 1

    client = modusign.ModusignClient()
    headers = {"Authorization": client.auth_header, "Accept": "application/json"}

    async with httpx.AsyncClient(base_url=config.MODUSIGN_API_BASE, headers=headers, timeout=30) as http:
        # ── 2. 인증 + 문서 목록 ────────────────────────────
        print("\n[2] 인증 및 문서 목록")
        status, payload = await probe(http, "문서 목록", modusign._ENDPOINTS["documents"])

        if status == 401 or status == 403:
            print(f"\n{NG} 인증에 실패했습니다.")
            print("       - 이메일/API Key가 모두싸인에 등록된 값과 같은지")
            print("       - API 사용이 가능한 요금제인지 확인하세요.")
            return 1
        if status == 404:
            print(f"\n{NG} 경로가 다릅니다. 모두싸인 API 문서의 문서 목록 경로를 확인한 뒤")
            print("       server/clients/modusign.py 의 _ENDPOINTS['documents'] 를 고치세요.")
            return 1
        if status == 0 or payload is None:
            return 1

        print("\n  응답 구조:")
        print(summarize(payload))

        rows = (payload.get("documents") or payload.get("data") or []) if isinstance(payload, dict) else []

        # ── 3. 정규화 결과 확인 ────────────────────────────
        if not rows:
            print("\n[3] 정규화 결과 — 건너뜀 (문서 0건)")
            print("       모두싸인 웹에서 테스트 문서를 1건 만들어 두면 문서 상세·이력·")
            print("       감사 추적 인증서 경로와 metadatas 매핑까지 확인할 수 있습니다.")
        else:
            print(f"\n[3] 정규화 결과 (문서 {len(rows)}건 중 첫 건)")
            doc = modusign._normalize_document(rows[0])
            print(f"  id            : {doc['id']}")
            print(f"  status        : {doc['status']}")
            print(f"  requested_at  : {doc['requested_at']}")
            print(f"  기부자        : {mask(doc['donor']['name'])}")
            print(f"  참여자 수     : {len(doc['participants'])}")

            print("\n  metadatas에서 읽어야 하는 기부 정보:")
            donation = doc["donation"]
            missing = []
            for key, label in [
                ("type", "기부 유형"), ("amount", "금액"), ("frequency", "납부 주기"),
                ("term_months", "약정 기간"), ("program_id", "사업 ID"),
                ("program_name", "사업명"), ("start_date", "시작일"), ("end_date", "종료일"),
            ]:
                value = donation.get(key)
                filled = value not in (None, "", 0)
                print(f"    {'o' if filled else 'x'} {label:10} = {value!r}")
                if not filled:
                    missing.append(key)

            if missing:
                print(f"\n  {NG.strip()} 비어 있는 항목: {', '.join(missing)}")
                print("       모두싸인 문서에 metadatas가 없으면 W1 집계가 0으로 나옵니다.")
                print("       문서를 만들 때 README의 metadatas 키 표대로 넣거나,")
                print("       _normalize_document 에서 기관 자체 DB 값을 병합하도록 고치세요.")

            # ── 4. 문서 단위 경로 ──────────────────────────
            doc_id = doc["id"]
            print("\n[4] 문서 상세 관련 경로")
            await probe(http, "문서 상세", modusign._ENDPOINTS["document"].format(document_id=doc_id))
            await probe(http, "문서 이력", modusign._ENDPOINTS["document_histories"].format(document_id=doc_id))
            await probe(http, "감사 추적 인증서", modusign._ENDPOINTS["audit_trail"].format(document_id=doc_id))
            await probe(http, "문서 파일", modusign._ENDPOINTS["document_file"].format(document_id=doc_id))

        # ── 5. 템플릿 (문서가 없어도 확인 가능) ────────────
        print("\n[5] 템플릿")
        status, tpl = await probe(http, "템플릿 목록", modusign._ENDPOINTS["templates"])
        if tpl:
            print("\n  응답 구조:")
            print(summarize(tpl))
            tpl_rows = (tpl.get("templates") or tpl.get("data") or []) if isinstance(tpl, dict) else []
            if tpl_rows:
                normalized = modusign._normalize_fields(tpl_rows[0])
                print(f"\n  첫 템플릿 항목 추출 결과: {len(normalized)}개")
                for f in normalized[:8]:
                    print(f"    - {f['label']} ({f['type']}, {f['assignee']})")
                if not normalized:
                    print(f"  {NG.strip()} 항목을 못 읽었습니다. _normalize_fields 의 participantFields 경로를 확인하세요.")
                await probe(http, "템플릿 상세",
                            modusign._ENDPOINTS["template"].format(template_id=tpl_rows[0].get("id")))
            else:
                print("\n       템플릿이 0건입니다. W6에서 쓸 템플릿을 모두싸인에 하나 만들어 두세요.")

    print("\n" + "=" * 72)
    print("진단 끝. [!!] 표시된 경로는 server/clients/modusign.py 의 _ENDPOINTS 에서 고치면 됩니다.")
    print("리마인드 재발송·문서 발송은 기부자에게 실제로 전달되므로 이 스크립트에서 호출하지 않았습니다.")
    print("=" * 72)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
