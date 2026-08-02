# AI 활용 증빙 — Q.sight

제출 요구 항목을 **소제목 번호 그대로** 정리했습니다.

| 요구 항목 | 위치 |
| --- | --- |
| 모델 | [1장](#1-모델) |
| API 사용 위치 | [2장](#2-api-사용-위치) |
| 프롬프트 / 설정 | [3장](#3-프롬프트--설정) |
| 테스트 · 검증 산출물 | [4장](#4-테스트--검증-산출물) |

서비스 전체 설명과 실행 방법은 [README.md](README.md), 개발 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다.

---

## 1. 모델

| 제품 | 모델 / 엔드포인트 | 쓰는 곳 |
| --- | --- | --- |
| **Solar Pro 2** | `solar-pro2` · `/v1/chat/completions` | 대화에서 약정 항목 값 추출 (기부자용) |
| **Document Parse** | `document-parse` · `/v1/document-digitization` | 계약서 서식 PDF·영수증 이미지 → 텍스트 (기관용) |
| **Information Extract** | `solar-pro2` + `json_schema` structured output | 추출한 텍스트 → 구조화된 항목 (기관용) |

- Upstage 3종을 모두 사용합니다
- 모델명은 환경변수로 교체 가능 — `UPSTAGE_MODEL`(기부자용) / `UPSTAGE_SOLAR_MODEL`(기관용)
- 타사 모델은 서비스 런타임에 쓰지 않습니다 (개발 도구로만 사용 — [5장](#5-개발-과정에서의-ai-활용))

---

## 2. API 사용 위치

### 2-1. 기부자용 — 대화에서 값 추출

| 파일 | 내용 |
| --- | --- |
| `qsight_client/server/src/lib/upstage.js` | Upstage 호출 래퍼. 함수는 `upstageToolCall()` 하나뿐 |
| `qsight_client/server/src/lib/prompts.js` | 추출용 프롬프트와 tool 스펙 |
| `qsight_client/server/src/routes/chat.js` | 일반 약정 챗봇 — **LLM 호출은 이 파일 한 곳** |
| `qsight_client/server/src/routes/legacy.js` | 유산기부 챗봇 — 같은 방식, 질문지 출처만 다름 |

### 2-2. 기관용 — 문서에서 항목 추출

| 파일 | 줄 | 내용 |
| --- | --- | --- |
| `qsight_corp/backend/server/clients/upstage.py` | 35 · 84 · 117 | `document_parse()` · `extract()` · `chat()` |
| `qsight_corp/backend/server/services/parsing.py` | 67 · 93 | W5 계약서 서식 PDF에서 입력 항목 추출 |
| `qsight_corp/backend/server/services/parsing.py` | 212 · 218 | W7 모금 공고문에서 사업 정보 자동 채우기 |
| `qsight_corp/backend/server/services/fulfillment.py` | 295 · 301 | W8 영수증·이체확인서에서 금액·납부일 추출 |

### 2-3. AI 출력이 서비스 동작에 직접 연결되는 지점

**서식 파싱 결과가 곧 챗봇의 질문지가 됩니다.**

```
기관이 계약서 PDF 업로드
  → Document Parse 가 텍스트로 읽고
  → Information Extract 가 입력 항목으로 구조화하고
  → 그 항목이 그대로 기부자용 챗봇의 질문이 된다
```

데모용 표시가 아니라 서비스 흐름의 일부입니다.

---

## 3. 프롬프트 / 설정

### 3-1. 값 추출 (Solar Pro 2, tool calling)

`qsight_client/server/src/lib/prompts.js` · `src/lib/upstage.js`

```js
temperature: 0
tools: [{ type: "function", function: COLLECT_INFO_TOOL }]
tool_choice: { type: "function", function: { name: "collect_info" } }   // 호출 강제
```

응답 본문에서 코드 블록을 정규식으로 긁는 대신 **tool call로 구조화된 인자**를 받습니다.
모델이 값을 설명 문장에 섞어 버리는 일이 줄어듭니다.

tool은 세 가지를 받습니다.

| 인자 | 뜻 |
| --- | --- |
| `parsed_fields` | 값이 **하나로 확정되는** 항목만 |
| `sources` | 각 값의 **근거가 된 사용자 표현 원문** |
| `unclear` | 언급했지만 확정 못 하는 항목 + 사용자가 실제로 한 말 |

프롬프트의 핵심 지시는 **"추측해서 채우는 것보다 `unclear`로 두는 편이 항상 낫다"** 입니다.
질문 목록은 프롬프트에 하드코딩되어 있지 않고, **매 턴 기관 서식에서 조립**됩니다.

### 3-2. 문서 추출 (Information Extract)

`qsight_corp/backend/server/clients/upstage.py:84`

```python
temperature: 0
response_format: {"type": "json_schema",
                  "json_schema": {"name": "extraction", "schema": schema, "strict": True}}
system: "너는 문서에서 요청한 항목만 정확히 뽑아내는 추출기다. 문서에 없는 값은 null로 둔다."
```

`strict: True`로 스키마를 강제하고, 문서에 없는 값은 지어내지 않고 `null`로 두게 했습니다.

### 3-3. 문서 파싱 (Document Parse)

`qsight_corp/backend/server/clients/upstage.py:35`

```python
model: "document-parse", ocr: "auto", output_formats: ["markdown"]
```

### 3-4. AI에 맡기지 않은 것 — 설정만큼 중요한 부분

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
무효입니다. 확률적 생성에 맡길 수 없어 템플릿 + 코드 조립으로 갔습니다.

### 3-5. 환각을 코드로 막은 장치

| 장치 | 파일 | 하는 일 |
| --- | --- | --- |
| 숫자 근거 검증 | `fields.js` `hasNumericBasis()` | 값의 **근거 표현에 수(數)가 없으면 버림** |
| 선택지 강제 | `fields.js` `normalizeSelect()` | `options` 밖의 값은 저장하지 않고 다시 질문 |
| 형식 정규화 | `fields.js` `sanitizeValues()` | number/date/check/select를 형식에 맞게, 실패 시 폐기 |
| 되묻기 | `format.js` `buildAssistantMessage()` | 확정 못 한 항목은 **사용자 표현을 인용해** 되물음 |
| 스펙 검증 | `legacySpec.js` `validateSpec()` | 대본에 법정 요건이 빠지면 **서버 기동 중단** |

---

## 4. 테스트 · 검증 산출물

자동화된 테스트 프레임워크는 없습니다. 아래는 **직접 실행해 확인한 결과**이며,
명령을 그대로 다시 돌려보실 수 있습니다.

### 4-1. 지어낸 숫자 차단 (2단 방어)

숫자 항목은 두 겹으로 막습니다. ① 값의 **근거가 된 표현에 수(數)가 없으면** 버리고,
② 통과하더라도 **숫자로 정규화되지 않으면** 저장하지 않습니다.

```bash
# qsight_client/server 에서 실행 (npm install 없이도 됩니다)
node --input-type=module -e "
import { hasNumericBasis, sanitizeValues } from './src/lib/fields.js';
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

### 4-2. 대본에서 법정 요건이 빠지면 서버가 뜨지 않는다

`legacy-spec.json`을 망가뜨린 5가지 경우 모두 기동이 중단됩니다.

| 망가뜨린 것 | 결과 |
| --- | --- |
| 날짜(`date`) 블록 삭제 | 차단 — `대본에 법정 요건 블록 "date"가 없습니다` |
| `review_checklist` 항목 삭제 | 차단 — `review_checklist는 5개여야 합니다 (지금 4개)` |
| 대본에 없는 플레이스홀더 | 차단 — `정의되지 않은 값 "{{nickname}}"` |
| 요건 블록에 `omit_if_empty` | 차단 — 법정 요건 문장은 값이 없다고 빠질 수 없음 |
| 재산 문구가 남의 항목 사용 | 차단 |

재현 (`qsight_client/server` 에서, `npm install` 없이도 됩니다):

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

### 4-3. 대본 조립 (재산 특정 방식별)

| 입력 | 만들어진 문구 |
| --- | --- |
| 상속재산의 비율 10% | `상속재산의 10퍼센트` |
| 정해진 금액 5천만 | `금 50,000,000원` |
| 남은 재산 전부 | `다른 상속과 유증을 하고 남은 재산 전부` |
| 보험금 | (문구 없음 — 유언 경로가 아니라 **보험사 수익자 변경 안내로 분기**) |

### 4-4. 전체 흐름 (갓 클론한 저장소, 키 0개)

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

### 4-5. 예외 처리

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

### 4-6. 확인하지 못한 것

정직하게 남깁니다.

- **녹음 캡처(MediaRecorder)** — 마이크가 없는 환경에서 검증해, 권한 거부 경로와 업로드·저장·재생
  경로만 확인했습니다. 실제 캡처는 데모 영상으로 확인해 주세요
- **서명 완료 후 약정서 PDF 미리보기** — 개인 모두싸인 계정 키가 없어 대체 안내 경로만 확인
- **모두싸인 웹훅** — 공인 URL이 필요해 로컬에서는 동작하지 않습니다. 수신 로직과 재시도 대응은
  구현되어 있고, 지금은 10초 폴링으로 대체합니다

---

## 5. 개발 과정에서의 AI 활용

코딩 에이전트(Claude Code)를 개발 전 과정에 사용했습니다. 저장소에 포함한 것:

| 파일 | 내용 |
| --- | --- |
| `CLAUDE.md` | 에이전트 작업 지침 — 깨면 안 되는 설계 규칙, 커밋·검증 방식 |
| `.claude/launch.json` | 세 서버 실행 설정 |

`CLAUDE.md`의 "깨면 안 되는 규칙"은 대부분 **실제로 문제를 겪은 뒤 추가된 것**입니다.
예를 들어 "LLM에게 문장을 만들게 하면 코드가 줄어든다는 제안을 하지 마세요"는 3-4장의
미성년자 오판 사고에서 나왔습니다.
