import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";
import { api } from "../../api.js";
import { loadLegacyIds, legacyStage, unfinishedPledges } from "../../legacyLocal.js";

/**
 * [1] 유산기부 안내 + 고지 동의.
 *
 * 동의 항목과 고지 문구는 legacy-spec.json에서 온다. 여기에 문장을 적어두지 않는 이유는
 * 법률 검토 결과에 따라 문구가 바뀌기 때문이다.
 */
export default function LegacyIntro() {
  const navigate = useNavigate();
  const { spec, loading, error } = useLegacySpec();
  const { legacy, setLegacy, resetLegacy } = usePledgeFlow();
  const [checked, setChecked] = useState(legacy.consent || {});
  const [unfinished, setUnfinished] = useState([]);

  // 기부 의사 등록까지 마쳤는데 아직 끝내지 않은 건이 있으면 먼저 알려준다.
  // 그대로 새로 시작하면 서명 요청이 또 나가고 기업용에 같은 사람의 약정이 두 건 생긴다.
  useEffect(() => {
    const ids = loadLegacyIds();
    if (ids.length === 0) return;
    api
      .lookupLegacyPledges(ids)
      .then((res) => setUnfinished(unfinishedPledges(res.pledges || [])))
      .catch(() => {});
  }, []);

  const items = spec?.consent || [];
  const allAgreed = items.filter((c) => c.required).every((c) => checked[c.key] === true);

  const toggle = (key) => setChecked((c) => ({ ...c, [key]: !c[key] }));

  const next = () => {
    // 새로 시작하는 흐름이므로 이전 진행분은 비운다 (spec은 그대로 둔다)
    resetLegacy();
    setLegacy({ consent: checked });
    navigate("/donate/legacy/programs");
  };

  return (
    <Layout title="유산 기부" subtitle="사후에도 이어지는 마음을 녹음으로 남겨요">
      <LegacySteps current={1} />
      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <Card>
          <div className="center-col" style={{ padding: 40 }}>
            <div className="spinner" />
          </div>
        </Card>
      ) : (
        spec && (
          <>
            {unfinished.length > 0 && (
              <Card title="진행 중인 유산기부가 있어요" subtitle="새로 시작하기 전에 확인해주세요">
                <div className="doc-list">
                  {unfinished.map((p) => {
                    const stage = legacyStage(p);
                    return (
                      <div className="doc-row" key={p.id}>
                        <div>
                          <div className="title">{p.programName || "유산기부"}</div>
                          <div className="meta">
                            {new Date(p.createdAt).toLocaleDateString("ko-KR")} 시작 · 기부 의사 등록까지
                            마침
                          </div>
                        </div>
                        <div className="gap-12" style={{ alignItems: "center" }}>
                          <span className={`badge ${stage.cls}`}>{stage.label}</span>
                          <button
                            className="btn btn-primary"
                            onClick={() => navigate(`/legacy/${p.id}/${stage.to}`)}
                          >
                            이어서 하기
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="hint">
                  아래에서 새로 시작하면 <strong>기관에 약정이 한 건 더 등록되고 서명 요청 메일도 다시
                  갑니다.</strong> 남은 단계만 마치려면 "이어서 하기"를 눌러주세요.
                </p>
              </Card>
            )}

            <Card title="어떻게 진행되나요?">
              <ol className="legacy-flow">
                <li>대화로 남기실 내용을 정리해요.</li>
                <li>법이 요구하는 문장이 들어간 대본을 만들어 드려요.</li>
                <li>기관에 기부 의사를 먼저 등록해요 (서명 요청 메일).</li>
                <li>증인 한 분과 함께 대본을 소리 내어 읽고 녹음해요.</li>
                <li>빠진 것이 없는지 함께 확인해요.</li>
              </ol>
              <div className="alert alert-info" style={{ margin: "18px 0 0" }}>
                {spec.notices?.intro}
              </div>
            </Card>

            <Card title="시작하기 전에 확인해주세요" subtitle="아래 내용을 읽고 동의해주세요">
              <div className="consent-list">
                {items.map((item) => (
                  <label key={item.key} className={`consent-row${checked[item.key] ? " on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={Boolean(checked[item.key])}
                      onChange={() => toggle(item.key)}
                    />
                    <span>
                      {item.text}
                      {item.required && <span className="consent-required">필수</span>}
                    </span>
                  </label>
                ))}
              </div>

              <button
                className="btn btn-primary btn-block btn-lg"
                style={{ marginTop: 20 }}
                disabled={!allAgreed}
                onClick={next}
              >
                {allAgreed ? "동의하고 시작하기" : "모든 항목에 동의해주세요"}
              </button>
              <p className="hint" style={{ textAlign: "center" }}>
                문안 버전 {spec.version} · 법률 검토: {spec.reviewed_by}
              </p>
            </Card>
          </>
        )
      )}
    </Layout>
  );
}
