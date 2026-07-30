"""Q.sight — 기부·봉사·유산기부 약정 플랫폼 (기업용 웹).

    http://localhost:8080/            → /corporate/ 로 이동
    http://localhost:8080/corporate/  → 기관용 웹 (W1~W9)
    http://localhost:8080/docs        → API 문서
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .clients.modusign import ModusignError
from .clients.modusign import client as modusign
from .clients.upstage import UpstageError
from .routers import (
    dashboard,
    donations,
    fulfillment,
    programs,
    reports,
    templates,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("qsight")

app = FastAPI(title="Q.sight API", version="1.0.0")

# 개발 편의를 위한 CORS. 배포 시에는 기관 도메인으로 제한할 것.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (dashboard, donations, templates, programs, fulfillment, reports):
    app.include_router(r.router)


@app.exception_handler(ModusignError)
async def modusign_error(_: Request, exc: ModusignError):
    log.warning("모두싸인 API 오류: %s", exc)
    return JSONResponse(status_code=502, content={"detail": str(exc), "source": "modusign"})


@app.exception_handler(UpstageError)
async def upstage_error(_: Request, exc: UpstageError):
    log.warning("Upstage API 오류: %s", exc)
    return JSONResponse(status_code=502, content={"detail": str(exc), "source": "upstage"})


@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    """정적 웹 파일은 캐시하지 않는다.

    JS 모듈이 브라우저에 캐시되면 코드를 고쳐도 화면이 그대로라
    "고쳤는데 왜 안 바뀌지"로 시간을 버리게 된다.
    운영 배포 시에는 파일명에 해시를 붙이고 이 미들웨어를 빼면 된다.
    """
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
    return response


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "org": config.ORG_NAME,
        "manager": config.ORG_MANAGER,
        "modusign": "demo" if modusign.mock else "connected",
        "upstage": "connected" if config.upstage_is_available() else "off",
    }


# 정적 웹 (반드시 라우터 등록 뒤에 마운트한다)
app.mount("/corporate", StaticFiles(directory=config.WEB_DIR / "corporate", html=True), name="corporate")
app.mount("/", StaticFiles(directory=config.WEB_DIR, html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server.main:app", host="0.0.0.0", port=config.PORT, reload=True)
