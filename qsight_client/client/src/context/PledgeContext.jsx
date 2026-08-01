import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { loadProfile, saveProfile } from "../profile.js";

const PledgeContext = createContext(null);

/**
 * 유산기부(녹음유언) 흐름의 상태.
 *
 * 별도 Context를 새로 파지 않는 이유는 program·signer·profile을 그대로 공유하기 때문이다.
 * (LEGACY_PLAN.md §5)
 */
const initialLegacy = {
  spec: null, // GET /api/legacy/spec 결과 (대본·질문·고지 문구의 유일한 출처)
  consent: {}, // 고지 동의 { key: true }
  program: null, // 유산기부 대상 사업
  values: {}, // 유산 전용 챗봇이 수집한 값
  messages: [], // 유산 전용 챗봇 대화 이력
  redirect: null, // 보험금처럼 유언 경로가 아닌 안내로 빠지는 경우
  pledgeId: null, // 서버에 만들어진 유산기부 등록 id
  script: null, // 서버가 렌더링해 준 대본 { blocks, text, missing }
  overrides: {}, // 편집 가능한 블록에 사용자가 고쳐 넣은 문장
  witness: null, // { name, contact, eligibility }
  recording: null, // { recordedAt, sha256, bytes, durationMs }
  checklist: [], // 자가 확인 결과
};

const initialState = {
  entry: null, // "pledge" | "find"
  program: null, // ①에서 고른 모금 사업
  form: null, // ②가 준 계약 항목 스키마 { fields, schema_version, ... }
  values: {}, // 챗봇이 수집한 값 (key는 field.key 그대로)
  messages: [], // 챗봇 대화 이력 (확인 화면에 갔다 돌아와도 유지되도록 보관)
  signer: null, // { name, email } - 서명 요청 메일이 갈 주소
  agreement: null, // ③ 결과 { agreementId, programName, status, message }
  legacy: initialLegacy,
};

export function PledgeProvider({ children }) {
  const [state, setState] = useState(initialState);
  // 기부자 기본정보는 약정 흐름과 수명이 달라서(사업을 바꿔도 유지) 따로 둔다
  const [profile, setProfileState] = useState(() => loadProfile());

  const setProfile = useCallback((next) => {
    saveProfile(next);
    setProfileState(next);
  }, []);

  const setEntry = useCallback((entry) => setState((s) => ({ ...s, entry })), []);
  const setProgram = useCallback(
    (program) =>
      setState((s) => ({
        ...s,
        program,
        form: null,
        values: {},
        messages: [],
        signer: null,
        agreement: null,
      })),
    []
  );
  const setForm = useCallback((form) => setState((s) => ({ ...s, form })), []);
  const setValues = useCallback((values) => setState((s) => ({ ...s, values })), []);
  const setMessages = useCallback(
    (messages) =>
      setState((s) => ({ ...s, messages: typeof messages === "function" ? messages(s.messages) : messages })),
    []
  );
  const setSigner = useCallback((signer) => setState((s) => ({ ...s, signer })), []);
  const setAgreement = useCallback((agreement) => setState((s) => ({ ...s, agreement })), []);
  const reset = useCallback(() => setState(initialState), []);

  // 유산기부는 화면이 여럿이라 매번 통째로 갈아끼우지 않고 바뀐 것만 병합한다
  const setLegacy = useCallback(
    (patch) =>
      setState((s) => ({
        ...s,
        legacy: { ...s.legacy, ...(typeof patch === "function" ? patch(s.legacy) : patch) },
      })),
    []
  );
  const resetLegacy = useCallback(
    () => setState((s) => ({ ...s, legacy: { ...initialLegacy, spec: s.legacy.spec } })),
    []
  );

  const value = useMemo(
    () => ({
      ...state,
      profile,
      setProfile,
      setEntry,
      setProgram,
      setForm,
      setValues,
      setMessages,
      setSigner,
      setAgreement,
      setLegacy,
      resetLegacy,
      reset,
    }),
    [
      state,
      profile,
      setProfile,
      setEntry,
      setProgram,
      setForm,
      setValues,
      setMessages,
      setSigner,
      setAgreement,
      setLegacy,
      resetLegacy,
      reset,
    ]
  );

  return <PledgeContext.Provider value={value}>{children}</PledgeContext.Provider>;
}

export function usePledgeFlow() {
  const ctx = useContext(PledgeContext);
  if (!ctx) throw new Error("usePledgeFlow는 PledgeProvider 내부에서 사용해야 합니다.");
  return ctx;
}

/** ④가 돌려주는 모두싸인 원본 상태값 */
export const STATUS_LABEL = {
  ON_GOING: "서명 진행중",
  COMPLETED: "서명 완료",
  REJECTED: "서명 거절됨",
  CANCELED: "취소됨",
};
