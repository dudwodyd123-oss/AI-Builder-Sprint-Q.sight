# Q.sight — 마음을 남기는 서명

> 기부·봉사·유산기부의 선한 의지를 **AI 대화로 정리하고, 전자서명으로 남기는** 플랫폼

| | 내용 |
| --- | --- |
| [1. 로컬 실행 가이드](#1-로컬-실행-가이드) | 서버 3개를 순서대로 (터미널 3개) |
| [2. 실행 환경 · 배포](#2-실행-환경--배포) | 필요 버전, 검증 환경, 배포·데모 |
| [3. 환경변수](#3-환경변수) | 키별 역할과 **없을 때 무엇이 제한되는지** |
| [4. AI 활용 증빙](#4-ai-활용-증빙) | 모델 · API 사용 위치(Upstage·모두싸인) · 프롬프트/설정 · 테스트·검증 산출물 |
| [5. 주요 코드](#5-주요-코드) | 핵심 코드 |
| [6. 커밋 내역](#6-커밋-내역) | 커밋 규칙과 개발 경과 |

## 1. 로컬 실행 가이드

기부자용 웹과 기관용 웹이 서로 통신하는 구조라 **서버 3개**를 순서대로 띄웁니다.

저장소는 두 웹으로 나뉩니다.

```text
qsight_corp/      기관용 — 모금 담당자가 쓰는 쪽
  backend/          FastAPI 서버 (기관용 화면도 여기서 서빙)  :8080
  frontend/         기관용 화면 (W1~W10)
qsight_client/    기부자용 — 기부자가 쓰는 쪽
  server/           Node 서버 (AI 챗봇, 기관 API 중계)        :4000
  client/           React 화면                                :5173
```

| 폴더 | 역할 | 포트 |
| --- | --- | --- |
| `qsight_corp/backend/` | 기관용 서버 — 사업·계약서식·약정·전자서명 (기관용 웹 화면 포함) | 8080 |
| `qsight_client/server/` | 기부자용 서버 — AI 챗봇, 기관 API 중계 | 4000 |
| `qsight_client/client/` | 기부자용 화면 (React) | 5173 |

> ⚠️ **아래 명령어는 전부 "프로젝트 루트"(README가 있는 폴더, 즉 `qsight_corp/`와
> `qsight_client/`가 보이는 위치)에서 실행한다고 가정합니다.**
> 터미널을 새로 열 때마다 먼저 `cd` (또는 `Set-Location`)로 이 폴더까지 이동했는지 확인하세요.



서버는 총 3개(기업용 / 기부자용 서버 / 기부자용 화면)이므로 **터미널(또는 명령 프롬프트) 창 3개를 동시에 켜둬야** 합니다. 본인 운영체제에 맞는 섹션만 따라가세요.

---

# 1. 윈도우(CMD) 버전


## 1단계. 명령 프롬프트 열기 (1번 창)

1. 탐색기에서 `개인용웹` 폴더 안으로 들어갑니다 ( `qsight_client`, `qsight_corp`가 보이는 화면이어야 함).
2. 화면 위쪽 **주소창을 클릭**합니다.
3. `cmd` 라고 입력하고 Enter.
4. 검은 창(명령 프롬프트)이 뜨면 이 폴더 위치에서 이미 시작된 것입니다. 이 창이 "1번 창".

확인:
```cmd
dir
```
`qsight_client`, `qsight_corp` 폴더가 보이면 성공.

> 이후 단계도 전부 이 방식(해당 폴더에서 주소창에 `cmd` 입력)으로 명령 프롬프트를 엽니다. 경로를 직접 입력할 필요 없습니다.

## 2단계. 필요한 프로그램 확인

```cmd
node -v
```
```cmd
python --version
```
- `node -v` → `v18` 이상이면 OK. 안 뜨면 [nodejs.org](https://nodejs.org)에서 LTS 설치.
- `python --version` → `Python 3.10` 이상이면 OK. 안 뜨면 [python.org](https://python.org)에서 설치 시 **"Add python.exe to PATH"** 체크박스 반드시 체크.


## 3단계. 기업용 서버 켜기 (1번 창, 반드시 먼저)

```cmd
pip install -r qsight_corp\backend\requirements.txt
```

`.env` 파일 만들기 (모두싸인 연동 키/메일 입력) — 1번 창은 `개인용웹` 폴더에 있으므로 경로를 그대로 붙여서 실행:
```cmd
copy qsight_corp\backend\.env.example qsight_corp\backend\.env
```
```cmd
notepad qsight_corp\backend\.env
```
- 파일이 열리면 모두싸인(전자서명) 관련 API 키 항목과 이메일 항목을 찾아 값을 채웁니다. (정확한 변수명은 파일을 열어 직접 확인 — 예: `MODUSIGN_API_KEY=`, `MODUSIGN_EMAIL=` 형태일 가능성이 높음)
- 저장(`Ctrl+S`) 후 메모장 닫기.

```cmd
python -m uvicorn server.main:app --port 8080 --app-dir qsight_corp\backend --reload
```
아래가 보이면 성공, **이 창은 닫지 마세요**:
```
INFO:     Uvicorn running on http://0.0.0.0:8080
INFO:     Application startup complete.
```
✅ 브라우저에서 `http://localhost:8080/corporate/` 접속 → 관리자 화면 확인.

## 4단계. 기부자용 서버 켜기 (2번 창)

탐색기에서 `개인용웹\qsight_client\server` 폴더로 들어가서 주소창 클릭 → `cmd` 입력 → Enter (1단계와 같은 방식). 이 창이 "2번 창".

```cmd
copy .env.example .env
```
```cmd
notepad .env
```
- `UPSTAGE_API_KEY=` 뒤에 발급받은 키 붙여넣기 (없으면 비워둬도 됨 → 7단계 챗봇만 안 됨).
- 저장(`Ctrl+S`) 후 메모장 닫기.

```cmd
npm install
```
```cmd
npm run dev
```
`Server listening on http://localhost:4000` 뜨면 성공, **창 닫지 마세요**.

## 5단계. 기부자용 화면 켜기 (3번 창)

탐색기에서 `개인용웹\qsight_client\client` 폴더로 들어가서 주소창 클릭 → `cmd` 입력 → Enter. 이 창이 "3번 창".

```cmd
npm install
```
```cmd
npm run dev
```
`Local: http://localhost:5173/` 뜨면 성공, **창 닫지 마세요**.

✅ 브라우저에서 `http://localhost:5173` 접속.

## 6단계. 기업용과 동기화 확인

1. `http://localhost:5173` 맨 위 **"진행중인 모금 사업"** 카드 확인.
2. 사업 이름 목록이 뜨면 → 8080 서버와 정상 연동. 안 뜨면 → 1번 창 확인.
3. 더 확실히: "새로운 약속 시작하기" → "정기 기부" 카드 → 목록 확인.

새 명령 프롬프트 창("4번 창", `Win+R` → `cmd` — 어느 폴더에서 열든 상관없음)에서 확인:
```cmd
curl http://localhost:8080/api/health
```
```cmd
curl http://localhost:4000/api/health
```
둘 다 `{"status":"ok" ...}` 비슷하게 나오면 정상.

## 7단계. 챗봇이 잘 작동하는지 확인

1. `http://localhost:5173` 홈 화면에서 "고향사랑기부" 또는 "문화유산 후원" 카드 클릭.
2. 화면을 아래로 스크롤 → **"AI 상담사와 대화로 신청서 채우기"** 대화창.
3. 입력창에 아무 말이나 적어봅니다. 예: `10만원씩 매달 후원하고 싶어요`
4. 몇 초 뒤 AI가 답장하면 → 챗봇 정상 작동.
5. 답이 안 오면 → 4단계에서 `.env`에 `UPSTAGE_API_KEY`를 제대로 넣었는지, 2번 창에 에러 문구가 있는지 확인.


## 종료 & 문제 해결

각 창에서 `Ctrl + C` → 서버 종료. 3개 창 모두 종료.

| 증상 | 확인할 것 |
| --- | --- |
| "진행중인 모금 사업" 안 뜬다 | 1번 창(8080) 켜져 있는지, 에러 문구 있는지 |
| 챗봇이 답을 안 한다 | `.env`의 `UPSTAGE_API_KEY`, 2번 창 에러 |
| 사진이 아이콘만 보인다 | 인터넷 연결 확인, 또는 캡처 전달 |
| `npm install` 에러 | `node -v` 18 이상인지 |
| `pip install` 에러 | `python --version` 3.10 이상인지, `pip`가 `python -m pip`로도 안 되면 재설치 |
| 기업용 화면에서 전자서명(모두싸인) 관련 기능이 안 됨 | `qsight_corp\backend\.env`에 모두싸인 키/이메일이 제대로 들어갔는지, 1번 창에 에러가 있는지 |
| 주소창에 `cmd` 입력해도 창이 안 뜬다 | 그 상태로 Enter 대신 창을 클릭 후 다시 시도, 또는 `Win+R` → `cmd` → Enter로 연 뒤 `cd` 명령으로 해당 폴더까지 수동 이동 |
| `python`/`pip` 명령어 자체가 안 먹힘 | 설치 시 "Add to PATH" 체크 여부 확인, PowerShell 아닌 CMD인지 확인 |

---

# 2. 맥 버전

## 1단계. 폴더 이동

```bash
cd ~/Desktop/개인용웹
```
```bash
ls
```
`qsight_client`, `qsight_corp` 보이면 성공.

## 2단계. 필요한 프로그램 확인

```bash
node -v
```
```bash
python3 --version
```
- `node -v` → `v18` 이상이면 OK. 안 뜨면 [nodejs.org](https://nodejs.org)에서 LTS 설치.
- `python3 --version` → `3.10` 이상이면 OK (macOS엔 보통 기본 설치됨).

## 3단계. 기업용 서버 켜기 (1번 창, 반드시 먼저)

```bash
pip3 install -r qsight_corp/backend/requirements.txt
```

> **이 명령에서 `externally-managed-environment`라는 문구가 섞인 에러가 뜨면**: Homebrew로 설치된 Python은 보안 정책상 기본 `pip install`을 막아둡니다. 아래처럼 옵션을 붙여서 다시 실행하세요.
> ```bash
> pip3 install -r qsight_corp/backend/requirements.txt --break-system-packages
> ```

```bash
python3 -m uvicorn server.main:app --port 8080 --app-dir qsight_corp/backend --reload
```
아래가 보이면 성공, **이 창은 닫지 마세요**:
```
INFO:     Uvicorn running on http://0.0.0.0:8080
INFO:     Application startup complete.
```
✅ 브라우저에서 `http://localhost:8080/corporate/` 접속 → 관리자 화면 확인.

## 4단계. 기부자용 서버 켜기 (2번 창)

새 터미널 창(`⌘+N`):

```bash
cd ~/Desktop/개인용웹/qsight_client/server
```
```bash
cp .env.example .env
```
```bash
open .env
```
- `UPSTAGE_API_KEY=` 뒤에 발급받은 키 붙여넣기 (없으면 비워둬도 됨 → 7단계 챗봇만 안 됨).
- 저장(`⌘+S`) 후 편집기 닫기.

```bash
npm install
```
```bash
npm run dev
```
`Server listening on http://localhost:4000` 뜨면 성공, **창 닫지 마세요**.

## 5단계. 기부자용 화면 켜기 (3번 창)

새 터미널 창(`⌘+N`):

```bash
cd ~/Desktop/개인용웹/qsight_client/client
```
```bash
npm install
```
```bash
npm run dev
```
`Local: http://localhost:5173/` 뜨면 성공, **창 닫지 마세요**.

✅ 브라우저에서 `http://localhost:5173` 접속.

## 6단계. 기업용과 동기화 확인

1. `http://localhost:5173` 맨 위 **"진행중인 모금 사업"** 카드 확인.
2. 사업 이름 목록이 뜨면 → 8080 서버와 정상 연동. 안 뜨면 → 1번 창 확인.
3. 더 확실히: "새로운 약속 시작하기" → "정기 기부" 카드 → 목록 확인.

새 터미널 창("4번 창")에서 확인:
```bash
curl http://localhost:8080/api/health
```
```bash
curl http://localhost:4000/api/health
```
둘 다 `{"status":"ok" ...}` 비슷하게 나오면 정상.

## 7단계. 챗봇이 잘 작동하는지 확인

1. `http://localhost:5173` 홈 화면에서 "고향사랑기부" 또는 "문화유산 후원" 카드 클릭.
2. 화면을 아래로 스크롤 → **"AI 상담사와 대화로 신청서 채우기"** 대화창.
3. 입력창에 아무 말이나 적어봅니다. 예: `10만원씩 매달 후원하고 싶어요`
4. 몇 초 뒤 AI가 답장하면 → 챗봇 정상 작동.
5. 답이 안 오면 → 4단계에서 `.env`에 `UPSTAGE_API_KEY`를 제대로 넣었는지, 2번 창에 에러 문구가 있는지 확인.


## 종료 & 문제 해결

각 창에서 `Ctrl + C` → 서버 종료. 3개 창 모두 종료.

| 증상 | 확인할 것 |
| --- | --- |
| "진행중인 모금 사업" 안 뜬다 | 1번 창(8080) 켜져 있는지, 에러 문구 있는지 |
| 챗봇이 답을 안 한다 | `.env`의 `UPSTAGE_API_KEY`, 2번 창 에러 |
| 사진이 아이콘만 보인다 | 인터넷 연결 확인, 또는 캡처 전달 |
| `npm install` 에러 | `node -v` 18 이상인지 |
| `pip3 install` 에러 | `python3 --version` 3.10 이상인지 |
| `externally-managed-environment` 에러 | 3단계 안내대로 `--break-system-packages` 옵션 붙여서 재설치 |
| `cd` 시 "No such file or directory" | 압축 위치가 바탕화면 맞는지, 폴더명이 `개인용웹`인지 |



## 2. 실행 환경 · 배포

| | 필요 버전 | 개발·검증 환경 |
| --- | --- | --- |
| Node.js | 18 이상 (`--env-file`, `MediaRecorder` 사용) | v24.15.0 |
| npm | 9 이상 | 11.12.1 |
| Python | 3.10 이상 (`X \| None` 타입 표기 사용) | 3.14.3 |
| OS | 무관 | Windows 11 · 크롬 |
| 브라우저 | **크롬 또는 엣지 권장** | 유산기부 녹음이 `MediaRecorder`를 씁니다 |

별도의 데이터베이스·클라우드 서비스가 필요 없습니다. 데이터는 각 서버의 `data/` 폴더에
JSON 파일로 저장되며, 첫 실행 시 자동으로 만들어집니다.

### 배포 · 데모

| | |
| --- | --- |
| 테스트 계정 | **불필요** — 로그인이 없습니다. 첫 화면에서 이름·이메일·전화번호만 입력하면 바로 이용할 수 있습니다 |
| 시드 데이터 | 첫 실행 시 부산 문화유산 모금 사업 4건과 계약서 서식이 자동 생성됩니다 |



## 3. 환경변수

`.env` 파일은 저장소에 포함되지 않습니다. 각 폴더의 `.env.example`을 `.env`로 복사한 뒤 값을 채워 넣으세요.
**키를 하나도 채우지 않아도 서버는 정상 실행되며, 아래 표의 "없으면" 항목만 제한됩니다.**

### `qsight_corp/backend/.env` (기관용 서버, :8080)

| 변수 | 설명 | 기본값 | 없으면 |
| --- | --- | --- | --- |
| `ORG_NAME` | 기관명 (화면에 표시) | `부산문화유산지킴이` | 기본값으로 표시 |
| `ORG_MANAGER` | 담당자명 (화면에 표시) | `김이레` | 기본값으로 표시 |
| `MODUSIGN_API_BASE` | 모두싸인 API 베이스 URL | `https://api.modusign.co.kr` | 그대로 사용 (변경 불필요) |
| `MODUSIGN_EMAIL` | 모두싸인 **기관** 계정 이메일 | — | 모두싸인 관련 기능이 **데모(mock) 모드**로 전환 (실제 서명 메일 미발송) |
| `MODUSIGN_API_KEY` | 모두싸인 **기관** 계정 API 키 | — | 위와 동일 |
| `MODUSIGN_FORCE_MOCK` | `1`이면 키가 있어도 강제로 데모 데이터 사용 | `0` | — |
| `UPSTAGE_API_KEY` | Upstage API 키 (서식 파싱 · 공고문 자동 채우기 · 증빙 추출용) | — | 문서 파싱이 **규칙 기반 폴백**으로 동작 (품질 저하, 동작은 함) |
| `UPSTAGE_SOLAR_MODEL` | 사용할 Upstage Solar 모델명 | `solar-pro2` | — |
| `PORT` | 서버 포트 | `8080` | — |
| `WEB_DIR` | 정적 웹(기관용 화면) 폴더 경로 | 비우면 `backend/web` → 없으면 `../frontend` 순으로 탐색 | — |

### `qsight_client/server/.env` (기부자용 서버, :4000)

| 변수 | 설명 | 기본값 | 없으면 |
| --- | --- | --- | --- |
| `UPSTAGE_API_KEY` | Upstage API 키 (AI 챗봇 LLM용) | — | **AI 챗봇 상담 기능이 비활성화** (그 외 기능은 정상) |
| `UPSTAGE_BASE_URL` | Upstage API 베이스 URL | `https://api.upstage.ai/v1` | — |
| `UPSTAGE_MODEL` | 사용할 Upstage 모델명 | `solar-pro2` | — |
| `QSIGHT_CORP_API` | 기관용 서버(:8080) 주소 | `http://localhost:8080` | 기관용 서버와 통신 불가 (사업 목록·계약 등 전부 실패) |
| `MODUSIGN_EMAIL` | 모두싸인 **개인** 계정 이메일 (기부자 본인 서명 문서 조회 전용) | — | **증서함**의 서명 문서 목록만 비활성화 (그 외 정상) |
| `MODUSIGN_API_KEY` | 모두싸인 **개인** 계정 API 키 | — | 위와 동일 |
| `MODUSIGN_BASE_URL` | 모두싸인 API 베이스 URL | `https://api.modusign.co.kr` | — |
| `HERITAGE_SERVICE_KEY` | data.go.kr 문화유산 Open API 서비스키 | — | 국가유산청 레거시 무료 API(서비스키 불필요)만 쓰면 비워도 됨 |
| `HERITAGE_API_URL` | 문화유산 Open API 요청 URL 전체 | — | **정적 목록**으로 폴백 (`/api/health`가 `heritage:static`으로 표시) |
| `HOMETOWN_REWARDS_SOURCE_URL` | 고향사랑기부 답례품 JSON API 주소 | — | 서버에 미리 담긴 샘플 데이터로 표시 |
| `HOMETOWN_REWARDS_LOCAL_FILE` | 고향사랑기부 답례품 로컬 JSON 파일 경로 | — | 위와 동일 |
| `PORT` | 서버 포트 | `4000` | — |

> ⚠️ 기관용(`qsight_corp/backend/.env`)의 `MODUSIGN_*`과 기부자용(`qsight_client/server/.env`)의 `MODUSIGN_*`은
> **반드시 서로 다른 모두싸인 계정**이어야 합니다. 기관용은 서명 요청(문서 생성)을, 기부자용은 조회만 합니다.

## 4. AI 활용 증빙

제출 항목 "모델 · API 사용 위치 · 프롬프트/설정 · 테스트·검증 산출물"에 대한 문서입니다.

### 한 장 요약

| 구분 | 무엇 | 어디 |
| --- | --- | --- |
| **제품 안의 AI** | Solar Pro 2 — 대화에서 약정 항목 값 추출 | `qsight_client/server` |
| | Document Parse — 계약서 서식·영수증에서 텍스트 추출 | `qsight_corp/backend` |
| | Information Extract — 추출한 텍스트를 입력 항목으로 구조화 | `qsight_corp/backend` |
| **제품 안의 전자서명 API** | 모두싸인 — 서명 요청·상태 조회·증빙 확보 (CLM 전 단계 연동) | `qsight_corp/backend` |
| **개발 과정의 AI** | Claude Code — 설계·구현·회귀 검증·문서 | 저장소 전체 |

이 프로젝트에서 가장 신경 쓴 것은 **AI에게 무엇을 맡기지 않을지**를 정한 것입니다((5) 참고).
AI·API 출력이 데모용 표시가 아니라 **서비스 동작에 직접 연결**됩니다((2)·(3) 참고).

---

### (1) 사용한 모델 · API

| 제품 | 모델 / 엔드포인트 | 쓰는 곳 |
| --- | --- | --- |
| **Solar Pro 2** | `solar-pro2` · `/v1/chat/completions` | 대화에서 약정 항목 값 추출 (기부자용) |
| **Document Parse** | `document-parse` · `/v1/document-digitization` | 계약서 서식 PDF·영수증 이미지 → 텍스트 (기관용) |
| **Information Extract** | `solar-pro2` + `json_schema` structured output | 추출한 텍스트 → 구조화된 항목 (기관용) |
| **모두싸인** | REST API — 문서 생성 · 조회 · 이력 · 웹훅 | 전자서명 요청부터 증빙 보관까지 (기관용) |

모델명은 환경변수로 바꿀 수 있습니다 — `UPSTAGE_MODEL`(기부자용) / `UPSTAGE_SOLAR_MODEL`(기관용).
API 키는 각 서버의 `.env`에만 두고 브라우저로 내려보내지 않습니다. 모두싸인 자격증명은
**기관용 서버에만** 두며, 기부자용 서버는 서명을 요청하지 않고 기부자 개인 계정으로 **조회만** 합니다.

---

### (2) 계약 생애주기(CLM) 어디에 AI·API가 붙어 있나

```text
[기관]  계약서 서식 PDF 업로드 ─────────── Document Parse → Information Extract
                │                          (PDF에서 입력 항목을 자동 추출)
                ▼
          계약 항목 스키마 등록
                │
                │  ← 이 스키마가 그대로 챗봇의 질문지가 된다
                ▼
[기부자]  AI 상담 ───────────────────────── Solar Pro 2 (tool calling)
                │                          (대화에서 항목 값 추출)
                ▼
          입력 내용 확인 ─────────────────  AI 미개입. 코드가 정리해 표시
                │
                ▼
          약정서 생성 → 모두싸인 서명 요청 → 서명 완료 → 증서함 보관
                │
                ▼
[기관]  이행 관리 ────────────────────────  Document Parse → Information Extract
                                           (영수증에서 금액·납부일 추출)
```

AI는 **파이프라인의 입구(서식 읽기) · 중간(대화 수집) · 사후(이행 판독)** 세 곳에, 모두싸인 API는
**서명 요청부터 증빙 보관까지 전 구간**에 들어가 있습니다. 계약서 본문 생성과 법적 효력 판단에는
AI가 관여하지 않습니다.

**서식 파싱 결과가 곧 챗봇의 질문지입니다.** 기관이 PDF를 올리면 Document Parse가 읽고,
Information Extract가 입력 항목으로 구조화하고, 그 항목이 그대로 기부자용 챗봇의 질문이 됩니다.
기관이 서식을 바꾸면 챗봇 질문도 코드 수정 없이 따라 바뀝니다.

---

### (3) API 사용 위치

#### 기부자용 — 대화에서 값 추출 (Solar Pro 2)

| 파일 | 줄 | 내용 |
| --- | --- | --- |
| `qsight_client/server/src/lib/upstage.js` | 44 | `upstageToolCall()` — Upstage 호출 래퍼. **전체에서 이 함수 하나뿐** |
| `qsight_client/server/src/lib/prompts.js` | 14 · 67 | `COLLECT_INFO_TOOL` 스펙 · `buildExtractionMessages()` |
| `qsight_client/server/src/routes/chat.js` | 50 | 일반 약정 챗봇 — LLM 호출 지점 |
| `qsight_client/server/src/routes/legacy.js` | 203 | 유산기부 챗봇 — 같은 방식, 질문지 출처만 다름 |

기부자용 서버에서 LLM을 부르는 곳은 위 **두 지점(chat.js:50, legacy.js:203)뿐**이며,
둘 다 같은 래퍼·같은 tool 스펙을 씁니다. 그 외 화면 문장·판단 로직에는 LLM이 개입하지 않습니다.

#### 기관용 — 문서에서 항목 추출 (Document Parse · Information Extract)

| 파일 | 줄 | 내용 |
| --- | --- | --- |
| `qsight_corp/backend/server/clients/upstage.py` | 35 · 84 · 117 | `document_parse()` · `extract()` · `chat()` |
| `qsight_corp/backend/server/services/parsing.py` | 67 · 93 | W5 계약서 서식 PDF에서 입력 항목 추출 |
| `qsight_corp/backend/server/services/parsing.py` | 212 · 218 | W7 모금 공고문에서 사업 정보 자동 채우기 |
| `qsight_corp/backend/server/services/fulfillment.py` | 295 · 301 | W8 영수증·이체확인서에서 금액·납부일 추출 |

#### 기관용 — 전자서명 (모두싸인 CLM API)

계약 생애주기를 **요청 → 체결 → 조회 → 증빙 → 보관**까지 실제 API로 잇습니다.

| CLM 단계 | 하는 일 | 엔드포인트 | 구현 위치 |
| --- | --- | --- | --- |
| **서식 준비** | 기관 템플릿 목록 조회 | `GET /templates` | `clients/modusign.py:341` · `routers/templates.py:49` |
| **요청 생성** | 약정서 PDF를 올려 서명 요청 발송 | `POST /documents` | `clients/modusign.py:356` · `services/agreements.py:238` |
| **체결 대기** | 서명자에게 재알림 | `POST /documents/{id}/participants/{pid}/remind` | `clients/modusign.py:285` · `routers/donations.py:73` |
| **상태 조회** | 단건 최신 상태(캐시 우회) | `GET /documents/{id}` | `clients/modusign.py:248` · `services/agreements.py:417` |
| | 목록 조회(캐시) | `GET /documents` | `clients/modusign.py:189` |
| **이벤트 수신** | 서명 완료 웹훅 | `POST /api/webhooks/modusign` (수신) | `routers/webhooks.py:31` · `:63` |
| **증빙 확보** | 서명 이력(감사 추적) | `GET /documents/{id}/histories` | `clients/modusign.py:260` · `routers/donations.py:106` |
| | 서명 완료 원본·감사추적 내려받기 | 문서 응답의 presigned URL | `clients/modusign.py:306` · `:323` |
| **보관** | 증빙 팩(약정서 + 감사추적 + 이행증빙) ZIP | — | `routers/donations.py:213` |


| 경로 | 확인 결과 |
| --- | --- |
| `/documents` | 200 — 확인 |
| `/documents/{id}` | 403 — 라우트 존재 (권한·리소스 문제) |
| `/documents/{id}/histories` | 403 — 존재 |
| `/documents/{id}/file` | 400 — 존재 |
| `/templates` · `/webhooks` | 200 — 확인 |


**실무에서 걸린 것과 해결**

| 문제 | 원인 | 해결 |
| --- | --- | --- |
| 파일 다운로드 실패 — `{"property":"signedUrlToken","message":"signedUrlToken should not be empty"}` | `/documents/{id}/file`을 직접 호출 (`signedUrlToken`은 우리가 만들 수 없음) | 문서 조회 응답 안의 완성된 presigned URL(`downloadUrl`)을 GET (`modusign.py:54` 주석 · `:306` `file_urls()`) |
| `429 Too Many Requests` | 화면마다 `/documents`를 재호출 | `Retry-After` 헤더 대기 후 재시도, 없으면 지수 백오프(최대 30초)(`modusign.py:131`·`:420`) · 문서 목록 캐시(`modusign.py:121`) · 기부자용 문서 상세 30초 캐시 · 서명 상태 폴링 10초 이상 고정(`AgreementWait.jsx`) |
| 웹훅이 로컬에서 안 옴 | 공인 URL 필요 | 웹훅 수신 로직(`routers/webhooks.py:31`)은 구현하고, 화면은 10초 폴링으로 상태 갱신 — 웹훅이 오면 그쪽이 먼저 반영되어 둘 중 하나가 없어도 흐름이 끊기지 않음 |

**API KEY가 없을 경우 예외 처리** — `MODUSIGN_EMAIL`·`MODUSIGN_API_KEY`가 비어 있으면
`modusign_is_mock()`이 참이 되어 **실제 메일 발송 없이** 약정 생성·상태 조회가 끝까지 진행됩니다.
심사 시 키 없이도 전체 흐름을 보실 수 있습니다. 현재 모드는 `GET /api/health`의 `modusign` 값으로
확인합니다(`"demo"` / `"connected"`).

---

### (4) 프롬프트 · 설정

#### 값 추출 (Solar Pro 2, tool calling)

`qsight_client/server/src/lib/upstage.js:44`

```js
export async function upstageToolCall(messages, tool, { temperature = 0 } = {}) {
  const data = await callUpstage({
    messages,
    temperature,                                                     // 추출이므로 결정적으로
    tools: [{ type: "function", function: tool }],
    tool_choice: { type: "function", function: { name: tool.name } },  // 도구 호출 강제
  });
```

응답 본문에서 ` ```json ` 블록을 정규식으로 긁는 대신 **tool call로 구조화된 인자**를 받습니다.
모델이 값을 설명 문장에 섞어 버리는 일이 줄어듭니다.

**tool 스펙** — `qsight_client/server/src/lib/prompts.js:14`

값을 "확정 / 근거 / 미확정" 세 갈래로 나눠 받는 것이 핵심입니다. `unclear` 채널이 없으면
모델은 "생략" 아니면 "단정" 둘 중 하나를 골라야 해서 추측하는 쪽으로 기웁니다.

```js
export const COLLECT_INFO_TOOL = {
  name: "collect_info",
  parameters: {
    type: "object",
    properties: {
      parsed_fields: { type: "object",
        description: "값이 하나로 확정되는 항목만 담는다. 단정할 수 없으면 여기 넣지 않는다." },
      sources:       { type: "object",
        description: "각 key가 사용자 메시지의 어느 표현에서 나왔는지. 메시지에 실제로 등장한 부분 그대로." },
      unclear:       { type: "object",
        description: "언급했지만 값을 하나로 확정할 수 없는 항목. 값은 사용자가 실제로 말한 표현 그대로." },
    },
    required: ["parsed_fields", "sources"],
  },
};
```

**시스템 프롬프트** — 질문 목록은 프롬프트에 하드코딩되어 있지 않고 **매 턴 기관 서식에서
조립**됩니다. 아래는 고정 규칙 부분입니다.

```text
너는 사용자와 대화하면서 정해진 항목의 정보를 수집하는 상담원이다.

규칙:
1. 반드시 collect_info tool을 호출해서 응답한다.
2. parsed_fields는 아래 수집 항목 목록에 있는 key만 사용한다. 목록에 없는 key는 만들지 않는다.
3. 이번 사용자 메시지에서 새로 알아낼 수 있는 정보만 채운다.
4. 이미 알고 있는 정보는 다시 채우지 않아도 된다.
5. 메시지에 없는 정보는 추측해서 지어내지 말고, 해당 key 자체를 생략한다.
6. 한 문장에 여러 항목이 섞여 있으면 빠짐없이 전부 추출한다.
   ("김민준이고 연락처는 010-1234-5678이에요" → donor_name과 contact 둘 다)
7. 선택지가 정해진 항목은 사용자의 말이 선택지 중 하나와 명확히 대응할 때만 채운다.
   (선택지가 "월 / 연 / 일시"인데 "분기마다"라고 말했다면 → 생략. "연"으로 바꾸지 않는다)
8. 값이 하나로 확정되지 않으면 parsed_fields가 아니라 unclear에 넣는다.
   확정 불가: "내년까지" · "가끔씩" · "좀 많이" · "당분간 계속"
   확정 가능: "1년간" → 12 · "매달" → "월" · "3만원씩" → 30000
   추측해서 채우는 것보다 unclear로 두는 편이 항상 낫다.
9. parsed_fields에 넣은 항목은 sources에 그 값의 근거가 된 표현을 반드시 함께 적는다.
```

#### 문서 추출 (Information Extract)

`qsight_corp/backend/server/clients/upstage.py:84`

```python
temperature: 0
response_format: {"type": "json_schema",
                  "json_schema": {"name": "extraction", "schema": schema, "strict": True}}
system: "너는 문서에서 요청한 항목만 정확히 뽑아내는 추출기다. 문서에 없는 값은 null로 둔다."
```

`strict: True`로 스키마를 강제하고, 문서에 없는 값은 지어내지 않고 `null`로 두게 했습니다.

#### 문서 파싱 (Document Parse)

```python
model: "document-parse", ocr: "auto", output_formats: ["markdown"]
```

---

### (5) AI에 맡기지 않은 것 — 그리고 그 이유

이 프로젝트에서 가장 신경 쓴 부분입니다.

| 일 | 담당 |
| --- | --- |
| 사용자 말에서 값 추출 | **AI** |
| 무엇이 아직 안 채워졌는지 판단 | 코드 (스키마와 값의 차집합) |
| 사용자에게 보여줄 문장 | 코드 (스키마의 label·type·options로 조립) |
| 유언 대본 문장 | 코드 (템플릿 + 값) |

**계기가 된 실제 오류** — 개발 중 챗봇이 "2007년생"을 미성년으로 판단해 보호자 연락처를
요구하고, 법적 근거를 지어내 설명하는 일이 있었습니다. 프롬프트로 막는 대신 **사용자에게
나가는 문장을 코드가 만들도록** 구조를 바꿨습니다. 이제 스키마에 없는 질문은 나갈 수 없습니다.

**유언 대본에 AI를 쓰지 않는 이유** — 민법 제1067조 녹음유언은 유언자가 유언의 취지·성명·연월일을,
증인이 정확함과 성명을 구술해야 합니다. "오늘은 ○년 ○월 ○일입니다" 한 줄이 빠지면 유언 전체가
무효입니다. 이걸 확률적 생성에 맡길 수 없어 템플릿 + 코드 조립으로 갔습니다.

#### 환각을 코드로 막은 장치

| 장치 | 파일 | 하는 일 |
| --- | --- | --- |
| 숫자 근거 검증 | `fields.js` `hasNumericBasis()` | 값의 **근거 표현에 수(數)가 없으면 버림** |
| 선택지 강제 | `fields.js` `normalizeSelect()` | `options` 밖의 값은 저장하지 않고 다시 질문 |
| 형식 정규화 | `fields.js` `sanitizeValues()` | number/date/check/select를 형식에 맞게, 실패 시 폐기 |
| 되묻기 | `format.js` `buildAssistantMessage()` | 확정 못 한 항목은 **사용자 표현을 인용해** 되물음 |
| 스펙 검증 | `legacySpec.js` `validateSpec()` | 대본에 법정 요건이 빠지면 **서버 기동 중단** |

---

### (6) AI가 결과 품질에 기여한 과정

프롬프트를 다듬는 것으로 끝내지 않고, **같은 종류의 실패가 다시 나올 수 없게 구조를 바꿨습니다.**
아래는 실제로 겪은 순서이며, 각 항목의 검증 결과는 (7)에 있습니다.

| # | 문제 | 조치 | 결과 |
| --- | --- | --- | --- |
| 1 | ` ```json ` 블록 정규식 파싱이 값을 흘림 (이름·주기 누락) | Upstage tool calling 지원을 직접 호출해 확인 후 `tool_choice`로 강제 | 같은 문장에서 5개 항목 한 번에 추출 |
| 2 | 스키마에 없는 질문·설명을 지어냄 (2007년생 → 보호자 요구) | **문장 생성에서 LLM 제거**, 코드가 조립 | 스키마 밖 단어가 나갈 경로 소멸. 턴당 호출 2회 → 1회 |
| 3 | 선택지 밖 값을 임의 매핑 ("분기마다" → "연") | 프롬프트 반례 명시 + `unclear` 채널 신설 | 3회 반복 실행 모두 확정하지 않고 재질문 |
| 4 | 근거 없는 숫자 생성 ("내년까지" → 12) | ① 수(數) 표현 검증 → **재발** → ② `sources`로 항목별 근거 검사 | 한 문장에서 금액·주기는 수용, 기간만 되물음 |
| 5 | 모두싸인 429 Too Many Requests | 문서 상세 30초 캐시 · 서명 폴링 10초 이상 고정 | 문서 화면당 호출 절반으로 감소 |

2번과 4번은 **한 번 고친 뒤 재발했고, 그때 프롬프트가 아니라 구조를 바꿨습니다.**

```text
나 : 매달 3만원씩 내년까지 낼게요. 어릴 때 뛰놀던 산성이 그대로 남았으면 해서요.
봇 : 회차 금액, 납부 주기, 기부 동기 확인했어요.
     "내년까지"라고 하셨는데, 정확히 어떻게 기록할지 몰라서요. 약정 기간을 알려주시겠어요?
```

---

### (7) 테스트 · 검증 산출물

아래는 **직접 실행해 확인한 결과**이며, 명령을 그대로 다시 돌려보실 수 있습니다.

#### 7-1. 지어낸 숫자 차단 (2단 방어)

숫자 항목은 두 겹으로 막습니다. ① 값의 **근거가 된 표현에 수(數)가 없으면** 버리고,
② 통과하더라도 **숫자로 정규화되지 않으면** 저장하지 않습니다.

```bash
node --input-type=module -e "
import { hasNumericBasis, sanitizeValues } from './qsight_client/server/src/lib/fields.js';
const fields = [{ key: 'term_months', label: '약정 기간', type: 'number', required: true }];
for (const s of ['1년간','3만원','내년까지','좀 많이','당분간'])
  console.log(s.padEnd(12), (hasNumericBasis(s)?'통과':'차단').padEnd(8),
              JSON.stringify(sanitizeValues(fields, { term_months: s }).term_months ?? null));
"
```

| 사용자 표현 | ① 근거 검증 | ② 최종 저장값 |
| --- | --- | --- |
| `1년간` | 통과 | `1` |
| `3만원` | 통과 | `30000` |
| `내년까지` | **차단** | `null` |
| `당분간` | **차단** | `null` |
| `좀 많이` | 통과 | **`null`** — "많이"의 '이'가 수 표현으로 잡혀 ①은 지나가지만 ②에서 걸림 |

`null`이 된 항목은 미수집으로 남아 챗봇이 다시 묻습니다. **어느 경우에도 값을 지어내지 않습니다.**

#### 7-2. 애매한 표현 되묻기

| 구분 | 입력 | 결과 |
| --- | --- | --- |
| 확정 불가 6종 | 내년까지 / 당분간 계속 / 좀 많이 / 가끔씩 / 분기마다 / (무관한 말) | 전부 확정하지 않고 되물음 |
| 확정 가능 3종 | 1년간 → `12` / 매달 → `"월"` / 3만원 → `30000` | 전부 정상 추출 |
| 혼합 | "매달 3만원씩 **내년까지**" | 금액·주기 수용, 기간만 되물음 |

#### 7-3. 대본에서 법정 요건이 빠지면 서버가 뜨지 않는다

`legacy-spec.json`을 망가뜨린 5가지 경우 모두 기동이 중단됩니다.

| 망가뜨린 것 | 결과 |
| --- | --- |
| 날짜(`date`) 블록 삭제 | 차단 — `대본에 법정 요건 블록 "date"가 없습니다` |
| `review_checklist` 항목 삭제 | 차단 — `review_checklist는 5개여야 합니다 (지금 4개)` |
| 대본에 없는 플레이스홀더 | 차단 — `정의되지 않은 값 "{{nickname}}"` |
| 요건 블록에 `omit_if_empty` | 차단 — 법정 요건 문장은 값이 없다고 빠질 수 없음 |
| 재산 문구가 남의 항목 사용 | 차단 |

재현 (기부자용 서버 폴더에서, `npm install` 없이도 됩니다):

```bash
node --input-type=module -e "
import { validateSpec } from './src/lib/legacySpec.js';
import { readFileSync } from 'node:fs';
const base = JSON.parse(readFileSync('config/legacy-spec.json','utf8'));
const s = JSON.parse(JSON.stringify(base));
s.script.blocks = s.script.blocks.filter(b => b.requirement !== 'date');  // 날짜 문장 삭제
try { validateSpec(s); console.log('통과'); } catch (e) { console.log(e.message); }
"
# → legacy-spec.json 검증 실패 — 대본에 법정 요건 블록 "date"가 없습니다.
```

실제 서버에서는 이 검증이 기동 시 실행되고, 실패하면 `process.exit(1)`로 **서버가 뜨지 않습니다**
(`qsight_client/server/src/index.js`).

#### 7-4. 대본 조립 (재산 특정 방식별)

| 입력 | 만들어진 문구 |
| --- | --- |
| 상속재산의 비율 10% | `상속재산의 10퍼센트` |
| 정해진 금액 5천만 | `금 50,000,000원` |
| 남은 재산 전부 | `다른 상속과 유증을 하고 남은 재산 전부` |
| 보험금 | (문구 없음 — 유언 경로가 아니라 **보험사 수익자 변경 안내로 분기**) |

#### 7-5. 전체 흐름 (갓 클론한 저장소, 키 0개)

```
등록 생성 → 대본 조립 → 의향 등록(agr_0001) → 증인 등록
→ 녹음 저장 → 기관 통보 "recorded" → 자가 확인 → 기관 통보 "verified"
```

기관용 `data/agreements.json`에 아래가 저장된 것까지 확인했습니다.

```json
{"pledge_id": "lg_...", "status": "verified", "duration_ms": 5000,
 "sha256": "1ce04574...", "has_witness": true,
 "checklist_passed": 5, "checklist_total": 5, "spec_version": "2026-07-31.1"}
```

#### 7-6. 예외 처리

| 상황 | 확인된 동작 |
| --- | --- |
| 대화 중 기관이 서식을 변경 | 메일 발송 전 `schema_version` 대조 → 바뀐 항목만 재질문 |
| 대화 중 사업이 보관됨 | 목록·서식·챗봇·약정 생성 네 지점에서 차단 |
| 증인 결격 문항에 "아니오" | 화면에서 진행 차단 + 서버가 `WITNESS_INELIGIBLE`로 재차 거부 |
| 증인 없이 녹음 업로드 | `WITNESS_REQUIRED` |
| 녹음 후 대본·증인 수정 시도 | `ALREADY_RECORDED` (자가 확인 저장은 계속 허용) |
| 기관 통보 실패 (엔드포인트 없음/서버 다운) | 기부자 진행은 계속, 실패를 기록하고 **다음 조회 때 자동 재시도** |
| 잘못된 등록 id (`../../package.json`) | 404 |
| 마이크 권한 거부 | 안내 문구 표시 후 대기 상태 유지 |
| Upstage 키 없음 | 서버는 정상 기동, 챗봇만 비활성 (`/api/health`에 `upstage: "off"`) |


### (8) 개발 과정에서의 AI 활용

| 도구 | 어디에 |
| --- | --- |
| **Claude Code** (Anthropic Claude) | 아키텍처 설계, 구현, 회귀 검증, 문서 작성, 커밋 |

편집기 자동완성이 아니라 **터미널에서 파일을 읽고 고치고 서버를 띄워 직접 확인하는** 방식으로
썼습니다. 그래서 "고쳤다"가 아니라 "고치고 돌려봤고 결과는 이것"이 가능했고, (6)·(7)의 결과가
전부 그 과정에서 나왔습니다. 외부 API 지원 여부(Upstage tool calling, 모두싸인 조회 범위)도
문서 추측 대신 실제로 호출해 확인했습니다.

작업 과정에서 지킨 규칙:

- **"테스트했다고 말하려면 실제로 돌려보고 결과를 보여주세요. 안 해봤으면 안 했다고 쓰세요."**
- 코드 주석은 "무엇을"이 아니라 **"왜 그렇게 했는지"**를 적는다
- 커밋은 한국어로, 제목은 `type(scope): 무엇을`, 본문은 **왜**
- `.env`는 절대 커밋하지 않는다. `.env.example`만 갱신한다

---

## 5. 주요 코드

### 봐주셨으면 하는 곳

| 파일 | 왜 |
| --- | --- |
| `qsight_client/server/src/routes/chat.js` | LLM 호출은 여기 한 곳(50줄)뿐. 나머지 판단은 전부 코드 |
| `qsight_client/server/src/lib/fields.js` | 값 정규화와 **지어낸 숫자 차단** (`hasNumericBasis`) |
| `qsight_client/client/src/format.js` | 챗봇 문장을 **코드가 조립** — 스키마 밖 질문이 나갈 수 없는 이유 |
| `qsight_client/server/config/legacy-spec.json` | 법률 검토 대상 문안을 한 파일에 모음 |
| `qsight_client/server/src/lib/legacySpec.js` | 대본에 법정 요건이 빠지면 **서버 기동 중단** |
| `qsight_corp/backend/server/clients/modusign.py` | 모두싸인 연동 — 엔드포인트 실재 확인 주석, 429 재시도 |
| `qsight_corp/backend/server/services/parsing.py` | Document Parse + Information Extract로 서식 읽기 |

### 파일 구조

```text
qsight_corp/backend/server/
  clients/     modusign.py      전자서명 (엔드포인트 확인·429 재시도·데모 모드)
               upstage.py       Document Parse · Information Extract · Solar
  services/    agreements.py    계약 항목 스키마, 약정 생성, 서명 요청
               parsing.py       서식 PDF·공고문 파싱
               fulfillment.py   영수증 판독, 이행 관리
               programs.py      모금 사업 (보관/재개 포함)
  routers/     public.py        기부자용 공개 API (①~④)
               webhooks.py      모두싸인 서명 이벤트 수신
               donations.py     기부 현황·증빙 팩

qsight_client/server/src/
  lib/         corp.js          기관 API 중계 (보관된 사업 차단)
               upstage.js       Solar 호출 래퍼 (tool call 강제)
               prompts.js       추출 tool 스펙 · 프롬프트
               fields.js        값 정규화 · 환각 차단
               legacySpec.js    대본 스펙 검증 (기동 시)
               legacyScript.js  대본 조립 (템플릿 + 값)
               modusign.js      기부자 개인 계정 — 조회 전용
  routes/      chat.js          일반 약정 챗봇
               legacy.js        유산기부 전용 API
               agreements.js    약정 생성 (schema_version 재확인)

qsight_client/client/src/
  format.js                     챗봇 문장 조립 · 값 표시 포맷
  profile.js                    기본정보(로그인 대체) · 스키마 자동 매칭
  components/SpeakButton.jsx    고지문 음성 안내 (녹음 중 잠금)
  pages/legacy/                 유산기부 9화면
```

## 6. 커밋 내역

### 커밋 규칙

한국어로, 제목은 `type(scope): 무엇을`, 본문은 **왜**를 씁니다.

```text
fix(W9): 리포트를 '발행'이 아닌 '초안'으로 바로잡고 집계 오류 수정

담당자가 발송된 것으로 오해할 수 있어 문구를 바꿨다. 이메일 채널이
연결되어 있지 않아 실제로는 아무것도 나가지 않는다.
```

<!-- TODO: 아래에 커밋 목록·개발 경과를 채워 주세요.
     생성 명령:
       git log --oneline --reverse
       git log --format="%ad %s" --date=short --reverse
-->

### 개발 경과

전체 커밋 목록 (`git log --format="%ad %s" --date=short --reverse`):

\`\`\`text
2026-07-26 Add README
2026-07-26 Revise README for AI Builder Sprint 2026
2026-07-27 Update README.md
2026-07-27 chore: 프로젝트 초기 폴더 구조 설정
2026-07-27 Merge pull request #1 from leekak/miggule
2026-07-30 feat(W1~W9): 기업용 웹 전체 구현 및 모두싸인 실연동
2026-07-30 docs: .env 변경 시 서버를 직접 재시작해야 함을 명시
2026-07-30 fix(modusign): 서명 요청 경로를 POST /documents 로 바로잡고 공식 스펙 반영
2026-07-30 feat(agreements): 계약서 PDF 생성과 모두싸인 서명 요청 발송 추가
2026-07-31 feat(W6/W7): 임베디드 편집기 제거, 서식 삭제·저장 안내·사업 보관 추가
2026-07-31 feat(W6): 기관이 미리 채우는 항목 추가
2026-07-31 feat(W2/W4/W8): 기부자 실명 표시, 원본 PDF 바로 열기, 회차 직접 선택
2026-07-31 fix(W1): 달성률 반올림으로 0% 되던 문제 수정, 예상·실제 수입 병기
2026-07-31 fix(W2/W8): 예정 납부일에 연도 표시
2026-07-31 feat(W8): 이행 관리를 사업→기부자→회차 드릴다운으로, 영수증 일괄 업로드 추가
2026-08-01 feat(W7): 유산기부 전용 서식 분리, 모금 사업을 목록·상세 화면으로 개편
2026-08-01 feat(W10): 유산 약정 탭 추가 — 건수 관리와 사후 수령 기록
2026-08-01 feat: 개인용 웹(qsight_client) 추가 — 기업용 API 연동 기반 기부 약정 흐름
2026-08-01 docs: 저장소 실행 방법 추가 + 고지문 음성 안내(TTS)
2026-08-01 docs: 심사위원 안내 문서 추가
2026-08-01 refactor(nav): 계약서 서식을 사이드바에서 빼고 모금 사업 아래로 되돌림
2026-08-01 fix(W8): 이행일이 예정일보다 앞서면 막지 말고 경고로 남긴다
2026-08-01 fix(W9): 리포트를 '발행'이 아닌 '초안'으로 바로잡고 집계 오류 수정
2026-08-01 fix(W2)/feat(W7): 지연 판정을 이행 관리와 맞추고, 사업 수정·삭제 추가
2026-08-01 fix(shell): 화면 재진입 시 이벤트 리스너가 쌓여 창이 여러 번 뜨던 문제
2026-08-02 feat(유산기부): 녹음 완료 사실을 기업용에 통보
2026-08-02 feat(public/W2/W3/W4): 유산기부 녹음유언 완료 사실 수신
2026-08-02 Merge branch 'feat/양예림' into feat/양예림2
2026-08-02 docs: 심사 안내에 맞춰 README 보강 — 프로젝트 우선, 실행 환경·테스트 조건 명시
2026-08-02 fix(.env.example): Upstage 키 자리표시자를 비워 health 표시가 사실과 맞게
2026-08-02 refactor: 기업용 코드를 qsight_corp/ 로 모아 기부자용과 대칭 구조로
2026-08-02 docs: CLAUDE.md(에이전트 지침)와 AI 활용 증빙 추가
2026-08-02 docs: 심사 안내를 README로 합치고 AI 활용 증빙을 요구 항목 순서로 재정리
\`\`\`

날짜별 요약:

- **7/26~7/27**: 프로젝트 초기 설정, README 뼈대, 폴더 구조 정리
- **7/30**: 기관용 웹(W1~W9) 전체 구현, 모두싸인 서명 요청 실연동
- **7/31**: 이행 관리 드릴다운, 영수증 일괄 업로드, 달성률·납부일 버그 수정
- **8/1**: 유산기부 전용 서식·유산 약정 탭 추가, 기부자용 웹(qsight_client) 신규 구축, 지연 판정·리포트 초안 처리 수정
- **8/2**: 유산기부 녹음유언 완료 통보 흐름, 기업용 코드 구조 정리(`qsight_corp/`), AI 활용 증빙·CLAUDE.md 문서화

전체 커밋 내역: https://github.com/dudwodyd123-oss/AI-Builder-Sprint-Q.sight/commits/main