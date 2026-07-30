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


def list_programs() -> list[dict]:
    rows = store.read_list("programs")
    if not rows:
        rows = [dict(p) for p in SEED_PROGRAMS]
        store.write("programs", rows)
    return rows


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
        "description": payload.get("description", ""),
        "tags": payload.get("tags") or suggest_tags(
            f"{payload['name']} {payload.get('description', '')}"
        ),
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
