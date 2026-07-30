# Q.sight — 기업용 웹 (기관 · 기부처)

기부자가 **모두싸인 전자서명**으로 체결한 약정서를 모아 보고, 이행까지 관리하는 기관용 웹입니다.
와이어프레임 **W1~W9** 9개 화면을 모두 구현했습니다.

- Python 서버: `FastAPI` + 모두싸인 REST + Upstage(Document Parse / Information Extract)
- 웹: `web/corporate/` 정적 HTML/CSS/ES Module (빌드 도구 없음)
- **모두싸인 API 키가 없어도 전체 화면이 동작합니다.** 키가 비어 있으면 데모 데이터로,
  키를 넣으면 실제 API로 자동 전환됩니다.

---

## 화면 목록

| 화면 | 경로 | 주요 기능 | 사용 API |
| --- | --- | --- | --- |
| W1 | `#/dashboard` | KPI 4종, 월별 신규 약정, 기부 유형 분포, 향후 6개월 예상 수입, 사업별 달성률 | 문서 목록 + 집계 |
| W2 | `#/donations` | 상태 필터, 다건 선택, **미서명자 일괄 리마인드** | 모두싸인 재발송 |
| W3 | `#/donations/at-risk` | 연속 미이행 · 반복 감액 · 열람 후 미서명 · 만료 임박 추출, 규칙 설정 | 규칙 기반 쿼리 |
| W4 | `#/donations/{id}` | 진행 타임라인, **원본 열기**, **실시간 상태 조회**, **증빙 팩 내려받기(zip)** | 문서 상세 + 이력 + 파일 |
| W5 | `#/templates/new` | **빈 계약서 양식** 스캔본 업로드 → 입력 항목 자동 추출, 항목 편집·출처 표시 | Document Parse + Information Extract |
| W6 | `#/templates/{id}/edit` | 제목·서명 참여자 설정, 데이터 라벨 배치, 임베디드 편집기 | 모두싸인 임베디드 초안 |
| W7 | `#/programs/new` | 사업 등록, 공고문 자동 채우기, 추천 태그 | 폼 + Information Extract |
| W8 | `#/fulfillment` | 회차별 이행 체크, 증빙 업로드 → 금액·날짜 추출 → **회차 자동 매칭** | Document Parse + Information Extract |
| W9 | `#/reports` | 분기 후원 리포트 발행, 발행 이력, 기부금영수증 대상 집계 | 정적 템플릿 + 집계 |

---

## 실행

### 1) 의존성 설치

```bash
pip install -r backend/requirements.txt
```

### 2) 환경변수

`backend/.env.example`을 `backend/.env`로 복사합니다. **키가 비어 있어도 그대로 실행됩니다.**

```env
MODUSIGN_EMAIL=            # 비우면 데모 데이터
MODUSIGN_API_KEY=
UPSTAGE_API_KEY=           # 비우면 문서 파싱은 규칙 기반 폴백
```

### 3) 서버 실행

```bash
python -m uvicorn server.main:app --port 8080 --app-dir backend --reload
```

접속:

- 기관용 웹 — http://localhost:8080/corporate/
- API 문서 — http://localhost:8080/docs

---

## 동작 모드

| | 모두싸인 키 없음 | 모두싸인 키 있음 |
| --- | --- | --- |
| 문서 목록 | 데모 데이터 58건 (진행 중 약정 42건) | 기관 실제 문서 |
| 리마인드 | 발송 시각만 기록 | 실제 재발송 API 호출 |
| 증빙 팩 | 이행 내역 JSON만 | 약정서 PDF + 감사 추적 인증서 포함 |
| 템플릿 저장 | 로컬에 templateId 생성 | 임베디드 편집 URL 반환 |

사이드바 하단과 `#/settings`에서 현재 연동 상태를 확인할 수 있습니다.

Upstage 키가 없으면 W5/W7/W8의 문서 추출이 폴백으로 동작합니다.

1. **pypdf**로 PDF 텍스트 레이어를 읽습니다.
2. 그 텍스트에 규칙(정규식)을 걸어 항목을 찾습니다.

**키 없이 되는 것은 텍스트 레이어가 있는 PDF뿐입니다.**
이미지(PNG/JPG)와 스캔본 PDF는 OCR이 필요해서 Upstage 키가 있어야 합니다.

### 못 읽었을 때는 항목을 만들어내지 않습니다

문서를 읽지 못하면 `readable: false`와 이유를 돌려주고 **항목 목록은 비웁니다.**
그럴듯한 기본 서식을 채워서 주면 담당자가 "이 문서에서 뽑힌 항목"으로 착각하기
때문입니다. 표준 서식이 필요하면 화면에서 "기본 서식으로 시작"을 눌러야 들어오고,
그때도 출처가 `기본 서식`으로 표시됩니다.

읽었는지 판정할 때는 글자 수가 아니라 **낱말 수와 낱말 비율**을 봅니다.
파일 바이트를 문자로 긁으면 `PNG`·`IHDR` 같은 포맷 조각이나 `obj`·`Catalog` 같은
PDF 내부 키워드가 잡혀서, 길이만 보면 수백 자를 "읽은" 것처럼 보이기 때문입니다.
같은 이유로 바이트 긁기 폴백은 아예 제거했습니다.

W5 표의 **출처** 열이 각 항목의 근거를 보여줍니다.

| 출처 | 뜻 |
| --- | --- |
| 서식 원문 | Upstage가 원문에서 추출 |
| 규칙 매칭 | 원문의 낱말을 정규식으로 매칭 |
| 기본 서식 | 원문을 못 읽어 기본값으로 채움 — **반드시 검수 필요** |
| 자동 보강 | 서명란처럼 우리가 추가한 항목 |

임의의 신뢰도 %를 만들어 보여주지 않습니다. 근거 없는 숫자는 담당자가
검수를 건너뛰게 만들기 때문입니다.

### .env를 고쳤으면 서버를 다시 켜야 합니다

`.env`는 서버가 시작할 때 한 번만 읽습니다. `--reload`는 `.py` 파일만 감시하고,
uvicorn의 파일 감시기가 `.`으로 시작하는 숨김 파일을 무시하기 때문에
`--reload-include .env`를 붙여도 동작하지 않습니다(확인함).

키를 넣거나 `MODUSIGN_FORCE_MOCK` 같은 값을 바꿨다면 **직접 재시작**하세요.
서버를 켠 터미널에서 `Ctrl+C` 후 다시 실행하면 됩니다.

터미널을 찾을 수 없을 때(포트가 잡혀 있을 때):

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

재시작 후 브라우저도 새로고침하세요. 사이드바 하단의 연동 상태
(`데모 데이터` / `모두싸인 연결됨`)로 반영됐는지 확인할 수 있습니다.

### 개발 중 캐시

정적 파일에 `Cache-Control: no-store`를 붙입니다(`main.py`의 `no_cache_static`).
이게 없으면 JS 모듈이 브라우저에 캐시되어 코드를 고쳐도 화면이 그대로입니다.
운영 배포 시에는 파일명에 해시를 붙이고 이 미들웨어를 빼세요.

---

## 구조

```text
├── backend/                           # 이 문서가 설명하는 부분
│   ├── server/
│   │   ├── main.py                    # FastAPI 진입점 + 정적 웹 마운트
│   │   ├── config.py                  # .env 로딩, mock 여부 판단, 웹 경로 탐색
│   │   ├── store.py                   # JSON 파일 저장소 (data/*.json)
│   │   ├── clients/
│   │   │   ├── modusign.py            # 모두싸인 REST 클라이언트 (+ 데모 모드)
│   │   │   ├── mock_data.py           # 데모 데이터 생성기
│   │   │   └── upstage.py             # Document Parse / Information Extract / Solar
│   │   ├── services/
│   │   │   ├── donations.py           # 문서 로딩 + 파생 필드 (모든 화면의 공통 기반)
│   │   │   ├── analytics.py           # W1 집계
│   │   │   ├── risk.py                # W3 규칙
│   │   │   ├── parsing.py             # W5 · W7 추출
│   │   │   ├── fulfillment.py         # W8 매칭
│   │   │   ├── programs.py            # W7 CRUD
│   │   │   └── report.py              # W9 집계
│   │   └── routers/                   # 화면별 API
│   ├── tools/check_modusign.py        # 모두싸인 연동 진단
│   ├── requirements.txt
│   ├── .env.example
│   └── data/                          # 런타임 저장 (커밋하지 않음)
└── frontend/
    ├── index.html                     # /corporate/ 로 이동
    └── corporate/
        ├── index.html
        ├── style.css                  # 디자인 토큰 (navy/coral/teal)
        └── js/
            ├── app.js                 # 해시 라우팅 + 셸
            ├── api.js  ui.js          # 통신 · 렌더 유틸 (차트 포함)
            └── views/w1_*.js ~ w9_*.js
```

서버는 `frontend/`를 정적 웹으로 마운트합니다. 위치를 바꾸려면 `.env`의
`WEB_DIR`로 지정하면 됩니다.

`data/*.json`은 실행 중 생성됩니다. 지우면 기본값으로 다시 초기화됩니다.

---

## 모두싸인 실 연동

### 진단 스크립트

```bash
python backend/tools/check_modusign.py
```

인증 · 엔드포인트 경로 · 응답 구조 · metadatas 매핑을 한 번에 확인합니다.
**GET만 호출**하므로 기부자에게 알림이 가지 않습니다. API 키는 출력하지 않고
기부자 이름은 마스킹합니다.

### 2026-07-30 실계정 확인 결과

인증 형식이 핵심입니다. **`base64(email:apiKey)`** 여야 하고,
`base64(apiKey + ":")` 는 400 `Authentication is failed` 가 납니다.

| 경로 | 판정 | 근거 |
| --- | --- | --- |
| `GET /documents` | 검증됨 | 200 · `{"count": int, "documents": [...]}` |
| `GET /templates` | 검증됨 | 200 · `{"count": int, "templates": [...]}` |
| `GET /documents/{id}` | 검증됨 | 403(라우트 존재) |
| `GET /documents/{id}/file` | 검증됨 | 400(라우트 존재) |
| `GET /documents/{id}/histories` | 검증됨 | 403(라우트 존재) |
| `POST /embedded-drafts` | 검증됨 | **201 확인** · `title`은 최상위 필수, `participantMappings`는 선택 |
| `GET /webhooks` | 검증됨 | 200 · 현재 등록된 웹훅 0건 |
| `POST /documents` | **서명 요청 경로** | 문서 생성 = 서명 요청. 아래 참고 |
| `GET /documents/{id}/audit-trail` | **없음** | 404 (변형 8종 모두 404) |
| `POST /documents/request-with-template` | **없는 경로** | `/documents/{id}`로 해석됨. 쓰지 말 것 |

### 서명 요청은 `POST /documents`

템플릿 없이 **완성된 PDF를 base64로 올려** 서명을 요청합니다.
서명란 위치는 PDF 본문의 앵커 텍스트(예: `(서명)`)를 찾아 그 옆에 놓습니다.

```
POST /documents
{
  "title": "...",                                  // 1~100자, 필수
  "file": { "base64": "...", "extension": "pdf" }, // 필수
  "participants": [{
    "name": "...",
    "signingOrder": 1,
    "signingMethod": { "type": "EMAIL", "value": "..." },
    "fields": [{
      "type": "SIGNATURE", "required": true,
      "signatureTypes": ["SIGN", "STAMP"],
      "position": { "anchor": { "text": "(서명)", "offset": { "x": 0.02, "y": 0 } } },
      "size": { "width": 0.18, "height": 0.06 }
    }]
  }],
  "metadatas": [{ "key": "...", "value": "..." }]   // 최대 10개
}
```

이 방식은 templateId가 필요 없어서 W6의 템플릿 회수 문제를 우회합니다.
**metadatas는 최대 10개**라 기부 정보 키가 이미 한도에 가깝습니다.

### 웹훅

문서 이벤트 10종을 받을 수 있습니다(`document_started`, `document_signed`,
`document_all_signed`, `document_rejected`, `document_request_canceled`,
`document_signing_canceled`, `document_modification_*` 4종).
모두싸인 웹 → 설정 → API → Webhook에서 등록합니다.

**주의 두 가지.** 응답이 2xx가 아니거나 처리가 10초를 넘으면 **최대 5회 재시도**하므로,
먼저 2xx를 돌려주고 실제 처리는 뒤에서 해야 중복 처리를 막을 수 있습니다.
그리고 **템플릿 저장 이벤트는 없습니다** — 문서 이벤트뿐이라 W6의 templateId
회수는 여전히 목록 비교로 해야 합니다.

### embeddedUrl 모드 파라미터

공식 문서가 정의한 값은 **`mode=preview` 하나뿐**입니다(내용만 보여주고 서명 요청은 막음).
팀에서 쓰던 `mode=create-template`은 임의로 만든 값이라 효과가 없어 제거했습니다.

라우트 존재 판별법: `403`/`400` = 라우트 있음(권한·리소스 문제),
`404 "Cannot GET"` = 라우트 없음.

**감사 추적 인증서 전용 API는 없습니다.** 서명 완료 PDF(`/documents/{id}/file`)에
포함되어 나오므로 증빙 팩은 이 PDF 하나로 구성합니다.

**Rate limit이 매우 빡빡합니다.** 연속 호출 2~3회에 429가 납니다.
`list_documents()`의 60초 캐시 없이는 화면 이동만으로 한도를 넘습니다.

확인 중 고친 것:

- 페이징 키가 `totalCount`가 아니라 **`count`** — 문서 100건 초과 시 2페이지를 못 받던 버그
- **429 Rate Limit** — 화면마다 `/documents`를 새로 부르면 대시보드 한 번 열고 이동하는
  것만으로 한도 초과. `list_documents()`에 60초 TTL 캐시 + `Retry-After` 백오프를 넣었습니다
  (`DOCUMENTS_TTL`, `RATE_LIMIT_RETRIES`).
- 약정이 0건일 때 예상 수입 배지가 `-100%`로 표시되던 문제

### W6 임베디드 편집기 — 실제 응답과 한계

`POST /embedded-drafts` 201 응답 (2026-07-30 확인):

```json
{
  "id": "01KYSC4ESAR7JAX2T62Z5RM8RF",
  "expiry": "2026-07-30T13:21:41.435Z",
  "embeddedUrl": "https://app.modusign.co.kr/embedded-draft/{id}?at=<JWT>&rt=<JWT>",
  "brandId": null
}
```

주의할 점 세 가지입니다.

**1. `embeddedUrl`은 자격증명입니다.** 쿼리에 접근 토큰(`at`, 2시간)과
갱신 토큰(`rt`, 24시간)이 들어 있습니다. 저장하거나 로그에 남기면 안 됩니다.
서버는 이 URL을 DB에 쓰지 않고 브라우저로 한 번만 내려보냅니다.

**2. `id`는 초안 ID이지 templateId가 아닙니다.** 모두싸인 웹훅에는 문서 이벤트만
있고 **템플릿 저장 이벤트가 없어서**, 편집기에서 저장이 끝난 시점을 알 방법이
없습니다. 그래서 초안을 만들기 전 템플릿 목록을 기억해 두었다가, 담당자가
"템플릿 연결"을 누르면 목록을 다시 읽어 새로 생긴 것을 찾습니다(`find_new_template`).

**3. `mode=create-template`은 공식 파라미터가 아니어서 제거했습니다.**
공식 모드는 `preview` 하나뿐입니다.

### 남은 확인

계정에 문서·템플릿이 0건이라 아래는 아직 검증하지 못했습니다.
모두싸인 웹에서 템플릿 1개와 본인 앞으로 보낸 테스트 문서 1건을 만든 뒤
진단 스크립트를 다시 돌리면 확인됩니다.

- `_normalize_document`의 참여자·상태·metadatas 매핑 (계정에 문서 0건)
- `_normalize_fields`의 `participantFields` 경로 (계정에 템플릿 0건)
- 편집기에서 실제로 저장했을 때 `find_new_template`이 템플릿을 찾아내는지
  (배치를 마친 뒤 "템플릿 연결"을 눌러 확인)
- `mode=create-template`이 편집기에서 실제로 먹히는지
- `POST /documents/request-with-template` 실재 여부 (개인용 웹 담당자와 확인)

### 경로 수정 지점

REST 경로는 `server/clients/modusign.py`의 `_ENDPOINTS` 한 곳에 모여 있습니다.
실제 스펙과 다르면 **이 딕셔너리와 `_normalize_document`만** 고치면 됩니다.

```python
_ENDPOINTS = {
    "documents": "/documents",
    "remind": "/documents/{document_id}/participants/{participant_id}/remind",
    "audit_trail": "/documents/{document_id}/audit-trail",
    ...
}
```

금액·주기·대상 사업 같은 기부 정보는 모두싸인 문서의 `metadatas`에 넣고 꺼내 씁니다
(`_normalize_document`). 개인용 웹에서 약정을 만들 때 같은 키로 넣어야 기관 화면 집계가 맞습니다.

| metadatas 키 | 예시 |
| --- | --- |
| `donation_type` | 정기 / 일시 / 봉사 / 유산 |
| `amount` | 30000 |
| `frequency` | 월 / 연 / 일시 |
| `term_months` | 12 |
| `program_id` / `program_name` | prog_1 / 금정산성 보존 지원 |
| `start_date` / `end_date` | 2026-03-01 / 2027-03-01 |
| `receipt_required` | true |

---

## 배포 메모

- `server/main.py`의 CORS는 개발 편의로 `*`입니다. 배포 시 기관 도메인으로 제한하세요.
- API 키는 서버 `.env`에만 두고 브라우저로 내려보내지 않습니다.
- 웹에서 API 주소가 다르면 query string으로 지정할 수 있습니다: `/corporate/?api=https://api.example.com`
- `data/`는 파일 저장소라 다중 인스턴스 배포 전에 DB로 교체해야 합니다
  (`store.py`의 함수 시그니처만 유지하면 됩니다).
