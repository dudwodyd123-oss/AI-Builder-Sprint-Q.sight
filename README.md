# AI Builder Sprint 2026

> 총 168시간, AI와 함께 만드는 도전

## 대회 소개

**AI Builder Sprint 2026**은 부산대학교 **APPTIVE**가 주최하고, **Upstage**, 부산대학교 **Anchor 사업단** 및 부산대학교 **AI융합교육원**이 후원하는 해커톤입니다. 참가자들은 자유로운 기술 스택을 바탕으로 실제로 동작하는 서비스를 직접 코드로 구현합니다.

| 항목 | 내용 |
| --- | --- |
| 주제 | AI를 통해 인간다움을 더욱 잘 드러낼 수 있는 서비스 개발 |
| 팀 구성 | 2~4인 1팀 |
| 개발 방식 | 코드 기반 앱 개발 필수 (노코드/로우코드 단독 사용 불가) |

### 진행 흐름

1. **팀 단위 참가 신청** — 팀원 정보, 프로젝트 아이디어, 활용 예정 AI 기술·API 제출
2. **참가팀 선발** (20~50팀) — 아이디어 참신성·실현 가능성·AI 활용 계획 기반 서류 심사
3. **예선 개발 기간** (7.27 ~ 8.3, 약 1주일) — API 크레딧 발급, 아이디어 구체화 및 개발
4. **결과물 제출 및 1차 심사** — 데모 영상/배포 링크, 코드 저장소, 발표 자료, AI 활용 증빙 제출
5. **본선 발표 및 질의응답** (8.7) — 팀당 7분 발표 + 5분 Q&A, 심사 후 수상팀 확정

### 기술 스택 및 규칙

- 사용 API·모델은 자유이며, **Upstage API**(Solar LLM, Document Parse, Information Extract) 활용 시 심사 가점
- Claude, GPT, Gemini 등 타사 모델 병행 사용 가능 (제약 없음)
- 프레임워크/언어 자유 (Python, JavaScript, React, Flutter 등)
- 결과물은 데모 가능한 동작하는 앱 (웹앱, 모바일앱, CLI 도구 등 형태 무관)
- 코딩 에이전트(Claude Code, Codex 등) 활용 시 `.claude/`, `AGENTS.md` 등 관련 설정·지침 파일을 저장소에 포함해야 심사에 반영됩니다

### 심사 기준

| 기준 | 배점 |
| --- | --- |
| 창의성 | 20점 |
| AI 활용도 | 20점 |
| 완성도 | 20점 |
| 실용성 | 20점 |
| 발표력 (본선) | 20점 |
| Upstage API 활용 가점 | +5점 |
| 지역사회 기여도 가점 | +5점 |

### 시상 내역

- 대상 1팀: 100만원 + 상품
- 최우수상 1팀: 50만원 + 상품
- 우수상 1팀: 상품
- 본선 참가 10팀: Upstage 굿즈 + 참가 인증서

> **심사위원께**: 무엇을 어떤 순서로 보실지는 [심사위원_안내.md](심사위원_안내.md)에 정리했습니다.

## Q.sight 실행하기

기부자용 웹과 기관용 웹이 서로 통신하는 구조라 **서버 3개**를 순서대로 띄웁니다.

```
브라우저 :5173 ──/api──▶ 개인용 서버 :4000 ──▶ 기업용 서버 :8080 ──▶ 모두싸인
                             │
                             └──▶ Upstage Solar (AI 챗봇)
```

| 폴더 | 역할 | 포트 |
| --- | --- | --- |
| `backend/` | 기관용 서버 — 사업·계약서식·약정·전자서명 (기관용 웹 화면 포함) | 8080 |
| `qsight_client/server/` | 기부자용 서버 — AI 챗봇, 기관 API 중계 | 4000 |
| `qsight_client/client/` | 기부자용 화면 (React) | 5173 |

### 1. 기관용 서버 (먼저 실행)

```bash
pip install -r backend/requirements.txt
python -m uvicorn server.main:app --port 8080 --app-dir backend --reload
```

- 기관용 웹 — http://localhost:8080/corporate/
- API 문서 — http://localhost:8080/docs

첫 실행이면 모금 사업과 계약서 서식이 **자동으로 채워집니다**. 별도 준비가 필요 없습니다.

### 2. 기부자용 서버

```bash
cd qsight_client/server
cp .env.example .env
npm install
npm run dev
```

### 3. 기부자용 화면

```bash
cd qsight_client/client
npm install
npm run dev
```

http://localhost:5173 으로 접속합니다.

### API 키

**키가 하나도 없어도 대부분의 기능이 동작합니다.** 모두싸인 자격증명이 없으면 기관용 서버가
자동으로 데모 모드로 전환되어, 실제 메일 발송 없이 약정 생성과 서명 상태 조회가 끝까지 진행됩니다.

| 키 | 넣는 곳 | 없으면 |
| --- | --- | --- |
| `UPSTAGE_API_KEY` | `qsight_client/server/.env` | **AI 챗봇 상담만 사용 불가** (그 외 전부 정상) |
| `MODUSIGN_EMAIL`·`MODUSIGN_API_KEY` | `backend/.env` | 데모 모드로 동작 (실제 서명 메일 미발송) |
| `MODUSIGN_EMAIL`·`MODUSIGN_API_KEY` | `qsight_client/server/.env` | 증서함의 서명 문서 목록만 비활성화 |

`.env` 파일은 저장소에 포함되지 않습니다. 각 폴더의 `.env.example`을 `.env`로 복사한 뒤
전달받은 값을 채워 넣으면 됩니다. 기부자용 서버에 넣는 모두싸인 키는 기관용과 **다른 개인 계정**
이어야 합니다 (본인이 서명한 문서를 조회하는 용도).

현재 설정 상태는 각 서버의 health 엔드포인트에서 확인할 수 있습니다.

```bash
curl http://localhost:8080/api/health
curl http://localhost:4000/api/health
```

각 폴더의 README에 더 자세한 설명이 있습니다 — [backend/README.md](backend/README.md),
[qsight_client/README.md](qsight_client/README.md).


## Git Fork 하는 방법

참가팀은 이 저장소를 팀 대표의 GitHub 계정으로 **Fork**한 뒤, 해당 Fork 저장소에서 프로젝트를 개발하고 최종 결과물을 제출합니다.

### 1. 저장소 Fork하기

1. [AI-Builder-Sprint 저장소](https://github.com/ApptiveDev/AI-Builder-Sprint)에 접속합니다.
2. 우측 상단의 **Fork** 버튼을 클릭합니다.
  <img width="1888" height="1131" alt="스크린샷 2026-07-27 오전 12 31 16" src="https://github.com/user-attachments/assets/2f0f7f80-6c92-4ba5-87c5-89ed6107eeab" />

3. 본인(또는 팀 대표) GitHub 계정으로 저장소가 복사됩니다. (`https://github.com/<내-계정>/AI-Builder-Sprint`)

### 2. Fork한 저장소 로컬로 클론하기

```bash
git clone https://github.com/<내-계정>/AI-Builder-Sprint.git
cd AI-Builder-Sprint
```

### 3. 개발 진행 및 커밋

```bash
git checkout -b develop
# 코드 작성 및 수정
git add .
git commit -m "feat: 프로젝트 초기 구현"
git push origin develop
```

포크된 저장소 내에서 개발을 진행해주시면 됩니다.

### 4. 결과물 제출

- **팀별로 Fork한 본인 저장소 URL을 제출 양식에 기재합니다.**
- 제출 마감 전까지 코드, 데모 영상/배포 링크, 발표 자료를 함께 준비해 제출해주세요.
- 코딩 에이전트를 활용한 경우 `.claude/`, `AGENTS.md` 등 설정 파일도 반드시 저장소에 포함해주세요.


## 문의

- 대회 관련 문의: 해커톤 문의 오픈채팅방
- 주최: 부산대학교 APPTIVE, 정보컴퓨터공학부 동아리연합회 / 후원: Upstage, 부산대 Anchor 사업단, 부산대 AI융합교육원
