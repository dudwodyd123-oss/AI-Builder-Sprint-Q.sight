import { createContext, useContext, useMemo, useState, useCallback } from "react";

const PledgeContext = createContext(null);

const initialState = {
  entry: null, // "pledge" | "find"
  type: null, // "regular" | "legacy" | "hometown" | "heritage"
  pledgeId: null,
  pledge: null,
  documentId: null,
  document: null,
};

export function PledgeProvider({ children }) {
  const [state, setState] = useState(initialState);

  const setEntry = useCallback((entry) => setState((s) => ({ ...s, entry })), []);
  const setType = useCallback((type) => setState((s) => ({ ...s, type })), []);
  const setPledge = useCallback(
    (pledge) => setState((s) => ({ ...s, pledge, pledgeId: pledge?.id ?? s.pledgeId })),
    []
  );
  const setDocument = useCallback(
    (document) => setState((s) => ({ ...s, document, documentId: document?.id ?? s.documentId })),
    []
  );
  const reset = useCallback(() => setState(initialState), []);

  const value = useMemo(
    () => ({ ...state, setEntry, setType, setPledge, setDocument, reset }),
    [state, setEntry, setType, setPledge, setDocument, reset]
  );

  return <PledgeContext.Provider value={value}>{children}</PledgeContext.Provider>;
}

export function usePledgeFlow() {
  const ctx = useContext(PledgeContext);
  if (!ctx) throw new Error("usePledgeFlow는 PledgeProvider 내부에서 사용해야 합니다.");
  return ctx;
}

export const TYPE_LABEL = {
  regular: "정기 기부",
  legacy: "유산 기부",
  hometown: "고향사랑기부",
  heritage: "문화유산 후원",
};
