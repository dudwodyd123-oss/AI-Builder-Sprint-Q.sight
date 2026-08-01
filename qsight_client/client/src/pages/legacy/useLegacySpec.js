import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";

/**
 * legacy-spec.json을 한 번만 받아 Context에 담아둔다.
 *
 * 대본 문안·질문 항목·결격 문항·고지 문구는 전부 이 spec에서 나온다.
 * 화면에는 어떤 문구도 하드코딩하지 않는다. (LEGACY_PLAN.md §2)
 */
export function useLegacySpec() {
  const { legacy, setLegacy } = usePledgeFlow();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!legacy.spec);

  useEffect(() => {
    if (legacy.spec) return;
    let alive = true;
    api
      .getLegacySpec()
      .then((res) => {
        if (alive) setLegacy({ spec: res.spec });
      })
      .catch((err) => {
        if (alive) setError(err.message || "유산기부 안내를 불러오지 못했어요.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { spec: legacy.spec, loading, error };
}
