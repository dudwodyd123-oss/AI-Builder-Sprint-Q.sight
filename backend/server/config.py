from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# backend/ 폴더의 .env만 읽는다. (다른 프로젝트의 .env와 독립적으로 동작)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATA_DIR = PROJECT_ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"


def _resolve_web_dir() -> Path:
    """정적 웹 폴더를 찾는다.

    레포는 backend/ · frontend/ 로 나뉘어 있지만, backend만 따로 떼어
    실행하는 경우도 있어 두 위치를 모두 지원한다.
    """
    override = os.getenv("WEB_DIR", "").strip()
    if override:
        return Path(override).resolve()
    local = PROJECT_ROOT / "web"
    if local.exists():
        return local
    return PROJECT_ROOT.parent / "frontend"


WEB_DIR = _resolve_web_dir()

for _d in (DATA_DIR, UPLOAD_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ── 기관 정보 ────────────────────────────────────────────────
ORG_NAME = os.getenv("ORG_NAME", "부산문화유산지킴이")
ORG_MANAGER = os.getenv("ORG_MANAGER", "김이레")

# ── 모두싸인 ─────────────────────────────────────────────────
MODUSIGN_API_BASE = os.getenv("MODUSIGN_API_BASE", "https://api.modusign.co.kr").rstrip("/")
MODUSIGN_EMAIL = os.getenv("MODUSIGN_EMAIL", "").strip()
MODUSIGN_API_KEY = os.getenv("MODUSIGN_API_KEY", "").strip()
MODUSIGN_FORCE_MOCK = os.getenv("MODUSIGN_FORCE_MOCK", "0").strip() == "1"


def modusign_is_mock() -> bool:
    """자격증명이 없거나 강제 플래그가 켜져 있으면 데모 데이터로 동작한다."""
    if MODUSIGN_FORCE_MOCK:
        return True
    return not (MODUSIGN_EMAIL and MODUSIGN_API_KEY)


# ── Upstage ─────────────────────────────────────────────────
UPSTAGE_API_BASE = "https://api.upstage.ai/v1"
UPSTAGE_API_KEY = os.getenv("UPSTAGE_API_KEY", "").strip()
UPSTAGE_SOLAR_MODEL = os.getenv("UPSTAGE_SOLAR_MODEL", "solar-pro2")


def upstage_is_available() -> bool:
    return bool(UPSTAGE_API_KEY)


# ── 서버 ────────────────────────────────────────────────────
PORT = int(os.getenv("PORT", "8080"))
