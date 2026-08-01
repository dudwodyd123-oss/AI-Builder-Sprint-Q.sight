import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";

/**
 * [2] 유산기부 대상 사업 선택.
 *
 * 예전 LegacyApplication 화면을 이 흐름에 맞게 옮긴 것. 사업을 고르면 유산 전용
 * 챗봇으로 가고, 일반 약정 챗봇(/programs/:id/chat)으로는 가지 않는다.
 */
export default function LegacyPrograms() {
  const navigate = useNavigate();
  const { legacy, setLegacy } = usePledgeFlow();
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // 동의를 건너뛰고 주소로 바로 들어온 경우 안내 화면으로 되돌린다
    if (Object.keys(legacy.consent || {}).length === 0) {
      navigate("/donate/legacy", { replace: true });
      return;
    }
    api
      .listPrograms()
      .then((res) => setPrograms(res.programs || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 유산기부는 기관이 유산 신청서 서식을 따로 등록한 사업에서만 진행할 수 있다.
  // 서식이 없다고 정기기부 서식으로 대신 받으면 "회차 금액·납부 주기"를 묻게 된다.
  const canSelect = (p) => Boolean(p.contract_ready && p.legacy_ready);

  const select = (program) => {
    if (!canSelect(program)) return;
    setLegacy({ program, values: {}, messages: [], pledgeId: null, script: null, redirect: null });
    navigate(`/donate/legacy/${program.id}/chat`);
  };

  return (
    <Layout title="유산 기부" subtitle="어느 사업에 남기고 싶으신가요?">
      <LegacySteps current={2} />
      {error && <div className="alert alert-danger">{error}</div>}

      <Card title="후원할 사업 선택" subtitle="고르신 사업 이름이 대본에 그대로 들어가요">
        {loading ? (
          <div className="center-col" style={{ padding: 30 }}>
            <div className="spinner" />
          </div>
        ) : programs.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>진행중인 모금 사업이 없어요.</p>
        ) : (
          <div className="doc-list">
            {programs.map((p) => (
              <div className="doc-row" key={p.id}>
                <div>
                  <div className="title">{p.name}</div>
                  <div className="meta">{(p.tags || []).slice(0, 3).join(" · ") || p.description}</div>
                </div>
                {canSelect(p) ? (
                  <button className="btn btn-primary" onClick={() => select(p)}>
                    이 사업으로 진행
                  </button>
                ) : (
                  <span className="badge badge-muted">
                    {p.contract_ready ? "유산기부 준비 중" : "준비 중"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {!loading && programs.some((p) => !canSelect(p)) && (
          <p className="hint">
            "유산기부 준비 중"은 기관이 그 사업의 유산기부 신청서를 아직 등록하지 않은 거예요.
            정기 기부로는 후원하실 수 있어요.
          </p>
        )}
      </Card>
    </Layout>
  );
}
