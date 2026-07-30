"""JSON 파일 기반 로컬 저장소.

모두싸인이 관리하지 않는 기관 자체 데이터(모금 사업, 이행 증빙, 리포트 발행
이력, 위험 판정 규칙, 서식 추출 결과)를 data/*.json 에 보관한다.
DB를 붙일 때는 이 모듈의 함수 시그니처만 유지하면 된다.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from . import config

_LOCK = threading.Lock()


def _path(name: str) -> Path:
    return config.DATA_DIR / f"{name}.json"


def read(name: str, default: Any) -> Any:
    p = _path(name)
    if not p.exists():
        return default
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        # 파일이 깨져도 서버는 살아 있어야 하므로 기본값으로 되돌린다.
        return default


def write(name: str, value: Any) -> None:
    p = _path(name)
    with _LOCK:
        tmp = p.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
        tmp.replace(p)


def read_list(name: str) -> list[dict]:
    value = read(name, [])
    return value if isinstance(value, list) else []


def append(name: str, item: dict) -> dict:
    items = read_list(name)
    items.append(item)
    write(name, items)
    return item


def upsert(name: str, item: dict, key: str = "id") -> dict:
    items = read_list(name)
    for i, existing in enumerate(items):
        if existing.get(key) == item.get(key):
            items[i] = {**existing, **item}
            write(name, items)
            return items[i]
    items.append(item)
    write(name, items)
    return item


def find(name: str, item_id: str, key: str = "id") -> dict | None:
    for item in read_list(name):
        if item.get(key) == item_id:
            return item
    return None


def next_id(name: str, prefix: str) -> str:
    return f"{prefix}_{len(read_list(name)) + 1:04d}"
