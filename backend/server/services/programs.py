"""W7 모금 사업 등록/조회.

모금 사업은 모두싸인이 아니라 기관이 가진 데이터라 로컬 저장소를 쓴다.
data/programs.json이 없으면 데모용 기본 사업 4건으로 초기화한다.
"""

from __future__ import annotations

from datetime import datetime

from .. import store
from ..clients.mock_data import PROGRAMS as SEED_PROGRAMS
from .parsing import suggest_tags

REQUIRED = ["name", "goal_amount", "start_date", "end_date"]

# 사업 상태. archived는 모금이 끝나 보관된 사업으로, 개인용 웹 목록에서 빠진다.
# 기존 약정과 집계는 그대로 유지되므로 대시보드·리포트에는 계속 잡힌다.
ACTIVE = "active"
ARCHIVED = "archived"


def list_programs(include_archived: bool = True) -> list[dict]:
    rows = store.read_list("programs")
    if not rows:
        rows = [dict(p) for p in SEED_PROGRAMS]
        store.write("programs", rows)
    # 예전에 만든 사업에는 status가 없다. 없으면 진행 중으로 본다.
    for r in rows:
        r.setdefault("status", ACTIVE)
    if include_archived:
        return rows
    return [r for r in rows if r.get("status") != ARCHIVED]


def get(program_id: str) -> dict | None:
    return next((p for p in list_programs() if p["id"] == program_id), None)


def create(payload: dict) -> dict:
    missing = [f for f in REQUIRED if not payload.get(f)]
    if missing:
        raise ValueError(f"필수 항목이 비어 있습니다: {', '.join(missing)}")

    programs = list_programs()
    program = {
        "id": payload.get("id") or f"prog_{len(programs) + 1}",
        "name": payload["name"].strip(),
        "goal_amount": int(payload["goal_amount"]),
        "start_date": payload["start_date"],
        "end_date": payload["end_date"],
        "methods": payload.get("methods") or ["정기", "일시"],
        "reward": payload.get("reward", ""),
        "template_id": payload.get("template_id") or "tpl_regular",
        # 유산기부용 서식. 비어 있으면 그 사업은 유산기부를 받지 않는다.
        # 기본 서식으로 대신하면 유산기부자에게 회차 금액·납부 주기를 묻게 되므로
        # 슬쩍 대체하지 않고 명시적으로 비워 둔다.
        "legacy_template_id": payload.get("legacy_template_id") or None,
        "description": payload.get("description", ""),
        "tags": payload.get("tags") or suggest_tags(
            f"{payload['name']} {payload.get('description', '')}"
        ),
        "status": ACTIVE,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    store.upsert("programs", program)
    return program


def update(program_id: str, payload: dict) -> dict:
    existing = get(program_id)
    if not existing:
        raise ValueError(f"모금 사업을 찾을 수 없습니다: {program_id}")
    merged = {**existing, **payload, "id": program_id}
    store.upsert("programs", merged)
    return merged


def set_status(program_id: str, status: str) -> dict:
    """사업을 보관하거나 다시 진행 중으로 되돌린다.

    보관해도 이미 맺은 약정과 집계는 그대로 남는다. 개인용 웹 목록에서만
    빠져서 기부자가 새로 선택할 수 없게 된다.
    """
    if status not in (ACTIVE, ARCHIVED):
        raise ValueError(f"알 수 없는 상태입니다: {status}")

    program = get(program_id)
    if not program:
        raise ValueError(f"모금 사업을 찾을 수 없습니다: {program_id}")

    program["status"] = status
    program["archived_at"] = (
        datetime.now().isoformat(timespec="seconds") if status == ARCHIVED else None
    )
    store.upsert("programs", program)
    return program


def with_progress(progress_rows: list[dict]) -> list[dict]:
    """W1 사업별 달성률 결과를 사업 목록에 붙여 개인용 웹에 내보낸다."""
    by_id = {r["id"]: r for r in progress_rows}
    out = []
    for p in list_programs():
        stat = by_id.get(p["id"], {})
        out.append({
            **p,
            "raised_amount": stat.get("raised_amount", 0),
            "donor_count": stat.get("donor_count", 0),
            "rate": stat.get("rate", 0),
        })
    return out
