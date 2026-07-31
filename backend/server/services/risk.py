"""W3 관리가 필요한 기부자 — 규칙 기반 추출.

4가지 규칙(연속 미이행 / 반복 감액 / 열람 후 미서명 / 만료 임박)을
data/risk_rules.json으로 조정할 수 있게 했다. 화면의 "규칙 설정"이 이 값을 고친다.
"""

from __future__ import annotations

from datetime import date

from .. import store

DEFAULT_RULES = {
    "consecutive_missed": {
        "enabled": True, "threshold": 2, "label": "연속 미이행",
        "action": "연락하기", "severity": "error",
    },
    "repeated_decrease": {
        "enabled": True, "threshold": 1, "label": "반복 감액",
        "action": "연락하기", "severity": "warning",
    },
    "viewed_not_signed": {
        "enabled": True, "days": 7, "label": "열람 후 미서명",
        "action": "리마인드", "severity": "warning",
    },
    "expiring_soon": {
        "enabled": True, "days": 30, "label": "만료 임박",
        "action": "갱신 제안", "severity": "muted",
    },
}


def get_rules() -> dict:
    saved = store.read("risk_rules", None)
    if not isinstance(saved, dict):
        return {k: dict(v) for k, v in DEFAULT_RULES.items()}
    merged = {}
    for key, default in DEFAULT_RULES.items():
        merged[key] = {**default, **(saved.get(key) or {})}
    return merged


def save_rules(patch: dict) -> dict:
    rules = get_rules()
    for key, value in (patch or {}).items():
        if key in rules and isinstance(value, dict):
            rules[key] = {**rules[key], **value}
    store.write("risk_rules", rules)
    return rules


def build(documents: list[dict], today: date | None = None) -> dict:
    today = today or date.today()
    rules = get_rules()
    rows: list[dict] = []

    for doc in documents:
        d = doc["derived"]

        r = rules["consecutive_missed"]
        if r["enabled"] and d["consecutive_missed"] >= r["threshold"]:
            rows.append(_row(doc, r, "consecutive_missed",
                             f"이행이 {d['consecutive_missed']}번 연속 밀렸습니다 · {d['delay_days']}일 경과",
                             priority=d["delay_days"]))

        r = rules["repeated_decrease"]
        if r["enabled"] and doc.get("amendment"):
            a = doc["amendment"]
            rows.append(_row(doc, r, "repeated_decrease",
                             f"감액 이력 · {a['before_amount']:,}원 → {a['after_amount']:,}원",
                             priority=a["before_amount"] - a["after_amount"]))

        r = rules["viewed_not_signed"]
        days = d["viewed_not_signed_days"]
        if r["enabled"] and days is not None and days >= r["days"]:
            rows.append(_row(doc, r, "viewed_not_signed",
                             f"약정서를 열어보고 {days}일째 서명하지 않았습니다",
                             priority=days))

        r = rules["expiring_soon"]
        remaining = d["days_to_expiry"]
        if r["enabled"] and d["is_active"] and remaining is not None and 0 <= remaining <= r["days"]:
            rows.append(_row(doc, r, "expiring_soon",
                             f"약정 만료 {remaining}일 전 · 갱신 의사 미확인",
                             priority=r["days"] - remaining))

    severity_order = {"error": 0, "warning": 1, "muted": 2}
    rows.sort(key=lambda r: (severity_order.get(r["severity"], 3), -r["priority"]))

    return {
        "rows": rows,
        "rules": rules,
        "summary": _summary(rows),
        "note": "떠난 뒤 다시 부르는 것보다 떠나기 전에 붙잡는 편이 낫습니다",
    }


def _row(doc: dict, rule: dict, key: str, reason: str, priority: float) -> dict:
    return {
        "document_id": doc["id"],
        "donor": doc["donor"]["name"],
        "phone": doc["donor"].get("phone"),
        "email": doc["donor"].get("email"),
        "rule": key,
        "rule_label": rule["label"],
        "reason": reason,
        "action": rule["action"],
        "severity": rule["severity"],
        "priority": priority,
        "program_name": doc["donation"].get("program_name"),
        "amount": doc["donation"].get("amount"),
        "type": doc["donation"].get("type"),
    }


def _summary(rows: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["rule_label"]] = counts.get(r["rule_label"], 0) + 1
    return [{"label": k, "count": v} for k, v in counts.items()]


def renewal_candidates(documents: list[dict], days: int = 60) -> list[dict]:
    """W9 리포트에서 쓰는 갱신 대상(만료 임박 + 이행 성실)."""
    out = []
    for doc in documents:
        d = doc["derived"]
        if not d["is_active"]:
            continue
        if d["days_to_expiry"] is not None and 0 <= d["days_to_expiry"] <= days:
            if (d["fulfillment_rate"] or 100) >= 80:
                out.append({
                    "document_id": doc["id"],
                    "donor": doc["donor"]["name"],
                    "end_date": d["end_date"],
                    "fulfillment_rate": d["fulfillment_rate"],
                })
    return sorted(out, key=lambda r: r["end_date"] or "")
