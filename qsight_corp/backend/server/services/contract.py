"""약정서 PDF 생성.

개인용 웹 챗봇이 모은 값으로 계약서 PDF를 만든다.
스캔한 서식은 "어떤 항목을 받는가"를 알아내는 데 쓰고, 최종 문서는 여기서
새로 그린다. 스캔본 위에 값을 얹으려면 항목마다 픽셀 좌표를 잡아야 하는데,
그 복잡도를 피하는 대신 결과물 모양을 우리가 통제한다.

**서명 앵커가 핵심이다.** 모두싸인은 PDF 본문에서 SIGN_ANCHOR 글자를 찾아
그 옆에 서명란을 놓는다. 이 글자가 없으면 서명란 없는 문서가 발송된다.
"""

from __future__ import annotations

import base64
import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from .. import config

# 모두싸인이 서명란 위치를 잡는 기준 글자. 클라이언트의 anchor_text와 같아야 한다.
SIGN_ANCHOR = "(서명)"

FONT_NAME = "NanumGothic"
FONT_PATH = config.PROJECT_ROOT / "assets" / "fonts" / "NanumGothic-Regular.ttf"

_font_ready = False


def _ensure_font() -> str:
    """한글 폰트를 등록한다. 폰트가 없으면 기본 폰트로 떨어진다(한글은 깨진다)."""
    global _font_ready
    if _font_ready:
        return FONT_NAME
    if not FONT_PATH.exists():
        return "Helvetica"
    pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_PATH)))
    _font_ready = True
    return FONT_NAME


class _Page:
    """A4 한 장에 위에서 아래로 그려 나가는 얇은 래퍼.

    reportlab은 좌하단이 원점이라 y를 직접 다루면 헷갈린다.
    여기서는 위에서부터 내려오는 커서 하나만 관리한다.
    """

    MARGIN_X = 22 * mm
    TOP = 275 * mm
    BOTTOM = 25 * mm

    def __init__(self, buf: io.BytesIO, font: str):
        self.c = canvas.Canvas(buf, pagesize=A4)
        self.font = font
        self.y = self.TOP
        self.width = A4[0]

    def _room(self, needed: float) -> None:
        if self.y - needed < self.BOTTOM:
            self.c.showPage()
            self.y = self.TOP

    def title(self, text: str) -> None:
        self._room(18 * mm)
        self.c.setFont(self.font, 20)
        self.c.drawCentredString(self.width / 2, self.y, text)
        self.y -= 12 * mm

    def subtitle(self, text: str) -> None:
        self._room(10 * mm)
        self.c.setFont(self.font, 9.5)
        self.c.setFillColor(colors.HexColor("#666666"))
        self.c.drawCentredString(self.width / 2, self.y, text)
        self.c.setFillColor(colors.black)
        self.y -= 10 * mm

    def rule(self) -> None:
        self._room(6 * mm)
        self.c.setStrokeColor(colors.HexColor("#CCCCCC"))
        self.c.line(self.MARGIN_X, self.y, self.width - self.MARGIN_X, self.y)
        self.c.setStrokeColor(colors.black)
        self.y -= 7 * mm

    def section(self, text: str) -> None:
        self._room(12 * mm)
        self.c.setFont(self.font, 12)
        self.c.drawString(self.MARGIN_X, self.y, text)
        self.y -= 7 * mm

    def row(self, label: str, value: str) -> None:
        """항목 한 줄. 값이 길면 줄바꿈한다."""
        self._room(9 * mm)
        self.c.setFont(self.font, 10)
        self.c.setFillColor(colors.HexColor("#555555"))
        self.c.drawString(self.MARGIN_X, self.y, label)
        self.c.setFillColor(colors.black)

        x = self.MARGIN_X + 45 * mm
        limit = self.width - self.MARGIN_X - x
        for line in _wrap(self.c, str(value or "—"), self.font, 10, limit):
            self.c.drawString(x, self.y, line)
            self.y -= 6 * mm
        self.y -= 2 * mm

    def paragraph(self, text: str, size: float = 9) -> None:
        self.c.setFont(self.font, size)
        limit = self.width - self.MARGIN_X * 2
        for line in _wrap(self.c, text, self.font, size, limit):
            self._room(7 * mm)
            self.c.drawString(self.MARGIN_X, self.y, line)
            self.y -= 5.5 * mm
        self.y -= 3 * mm

    def gap(self, mm_: float) -> None:
        self.y -= mm_ * mm

    def save(self) -> None:
        self.c.save()


def _wrap(c: canvas.Canvas, text: str, font: str, size: float, limit: float) -> list[str]:
    """글자 폭을 재서 줄을 나눈다. 한글은 공백이 드물어 글자 단위로도 끊는다."""
    lines: list[str] = []
    for raw in str(text).split("\n"):
        line = ""
        for ch in raw:
            if c.stringWidth(line + ch, font, size) <= limit:
                line += ch
            else:
                lines.append(line)
                line = ch
        lines.append(line)
    return lines or [""]


def build_agreement_pdf(
    program: dict,
    fields: list[dict],
    values: dict,
    signer: dict,
    org_name: str | None = None,
) -> str:
    """약정서 PDF를 만들어 base64 문자열로 돌려준다.

    fields는 W5/W6에서 확정한 계약 항목이고, values는 챗봇이 모은 값이다.
    fields에 있는 항목만 그린다 — 기관이 서식을 바꾸면 문서도 따라 바뀐다.
    """
    org_name = org_name or config.ORG_NAME
    font = _ensure_font()
    buf = io.BytesIO()
    page = _Page(buf, font)
    today = date.today()

    page.title(f"{program.get('name', '기부')} 약정서")
    page.subtitle(f"{org_name} · {today.isoformat()}")
    page.rule()

    # ── 약정 내용 ────────────────────────────────────────
    page.section("1. 약정 내용")
    for f in fields:
        if f.get("type") == "sign":
            continue  # 서명란은 아래에서 앵커로 처리한다
        page.row(f.get("label", f.get("key", "")), _display(f, values.get(f.get("key"))))

    # ── 모금 사업 ────────────────────────────────────────
    page.gap(3)
    page.section("2. 모금 사업")
    page.row("사업명", program.get("name", ""))
    if program.get("description"):
        page.row("사업 내용", program["description"])
    if program.get("reward"):
        page.row("답례품", program["reward"])
    page.row("모금 기간", f"{program.get('start_date', '')} ~ {program.get('end_date', '')}")

    # ── 약관 ────────────────────────────────────────────
    page.gap(3)
    page.section("3. 약정 조건")
    # 원문자(①②③)는 나눔고딕에 글리프가 없어 빈칸으로 찍힌다. 일반 숫자를 쓴다.
    page.paragraph(
        "1) 기부자는 위 내용대로 기부할 것을 약정하며, 기부금은 명시된 모금 사업의 목적에만 사용됩니다.\n"
        "2) 기부자는 언제든지 약정의 변경 또는 해지를 요청할 수 있으며, 기관은 지체 없이 이에 응합니다.\n"
        "3) 기관은 기부금의 사용 내역을 정기적으로 기부자에게 보고합니다.\n"
        "4) 수집된 개인정보는 기부금 영수증 발급과 후원 안내 목적으로만 이용됩니다."
    )

    # ── 서명란 (앵커 포함) ───────────────────────────────
    page.gap(6)
    page.rule()
    page.section("4. 서명")
    page.paragraph("위 내용을 확인하였으며, 이에 동의하여 서명합니다.", size=9.5)
    page.gap(4)
    page.row("기부자", signer.get("name", ""))
    page.row("이메일", signer.get("email", ""))
    page.row("약정일", today.isoformat())
    page.gap(4)

    # 모두싸인이 이 글자를 찾아 오른쪽에 서명란을 놓는다. 지우면 서명란이 사라진다.
    page.c.setFont(font, 11)
    page.c.drawString(_Page.MARGIN_X, page.y, f"기부자 서명 : {SIGN_ANCHOR}")
    page.y -= 10 * mm

    page.c.setFont(font, 8.5)
    page.c.setFillColor(colors.HexColor("#888888"))
    page.c.drawString(_Page.MARGIN_X, page.y, f"{org_name} · 본 문서는 Q.sight에서 생성되었습니다.")
    page.c.setFillColor(colors.black)

    page.save()
    return base64.b64encode(buf.getvalue()).decode()


def _display(field: dict, value) -> str:
    """항목 유형에 맞춰 보기 좋게 바꾼다."""
    if value in (None, ""):
        return "—"
    ftype = field.get("type")
    if ftype == "check":
        return "동의함" if value in (True, "true", "y", "예", 1) else "동의하지 않음"
    if ftype == "number":
        try:
            return f"{int(str(value).replace(',', '')):,}"
        except ValueError:
            return str(value)
    return str(value)


def font_available() -> bool:
    return FONT_PATH.exists()
