"""W1 대시보드."""

from __future__ import annotations

from fastapi import APIRouter

from .. import config
from ..clients.modusign import client as modusign
from ..services import analytics, donations, programs

router = APIRouter(prefix="/api/dashboard", tags=["W1"])


@router.get("")
async def get_dashboard():
    docs = await donations.load_documents()
    data = analytics.build(docs, programs.list_programs())
    data["org"] = {"name": config.ORG_NAME, "manager": config.ORG_MANAGER}
    data["data_source"] = "demo" if modusign.mock else "modusign"
    return data
