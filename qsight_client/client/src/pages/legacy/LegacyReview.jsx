import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout.jsx";
import Card from "../../components/Card.jsx";
import LegacySteps from "./LegacySteps.jsx";
import { useLegacySpec } from "./useLegacySpec.js";
import { api } from "../../api.js";
import { usePledgeFlow } from "../../context/PledgeContext.jsx";
import { rememberLegacyId } from "../../legacyLocal.js";

/**
 * [8] 재생 + 자가 확인.
 *
 * 지금은 사람이 듣고 체크한다(source: "self"). 나중에 STT가 붙으면 source가 "stt"로,
 * timecode가 채워지면서 체크가 자동으로 켜진다. 화면 구조는 그대로 두고 데이터 출처만
 * 바뀌도록 항목 모양을 지금부터 그렇게 잡아둔다. (LEGACY_PLAN.md §8)
 */
export default function LegacyReview() {
  const { pledgeId } = useParams();
  const navigate = useNavigate();
  const { spec, error: specError } = useLegacySpec();
  const { setLegacy } = usePledgeFlow();

  const [pledge, setPledge] = useState(null);
  const [checked, setChecked] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getLegacyPledge(pledgeId)
      .then((res) => {
        setPledge(res.pledge);
        setLegacy({ pledgeId: res.pledge.id, script: res.script, recording: res.pledge.recording });
        const prior = {};
        (res.pledge.checklist || []).forEach((c) => {
          if (c.checked) prior[c.key] = true;
        });
        setChecked(prior);
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pledgeId]);

  const items = spec?.review_checklist || [];
  const allChecked = items.length > 0 && items.every((i) => checked[i.key]);

  /**
   * 녹음만 다시 한다. 등록은 새로 만들어지지만 기부 의사 등록(서명)은 물려받으므로
   * 기업용에는 같은 사람의 약정이 하나만 남는다.
   */
  const redo = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.redoLegacyPledge(pledgeId);
      rememberLegacyId(res.pledge.id);
      setLegacy({
        pledgeId: res.pledge.id,
        script: res.script,
        witness: res.pledge.witness,
        recording: null,
        checklist: [],
      });
      navigate(`/legacy/${res.pledge.id}/record`);
    } catch (err) {
      // 이미 다시 만든 적이 있으면 그 등록으로 보낸다
      if (err.code === "ALREADY_SUPERSEDED" && err.data?.pledgeId) {
        navigate(`/legacy/${err.data.pledgeId}/record`);
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const checklist = items.map((item) => ({
        key: item.key,
        label: item.label,
        checked: Boolean(checked[item.key]),
        source: "self", // STT가 붙으면 "stt"가 들어올 자리
        timecode: null,
      }));
      const res = await api.updateLegacyPledge(pledgeId, { checklist });
      setLegacy({ checklist: res.pledge.checklist });
      navigate(`/legacy/${pledgeId}/done`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout title="녹음 확인" subtitle="빠진 것이 없는지 들어보며 확인해요">
      <LegacySteps current={8} />
      {(error || specError) && <div className="alert alert-danger">{error || specError}</div>}

      <Card title="녹음 다시 듣기">
        {pledge?.recording ? (
          <>
            <audio className="legacy-audio" controls src={api.legacyRecordingUrl(pledgeId)} />
            <table className="info-table" style={{ marginTop: 14 }}>
              <tbody>
                <tr>
                  <th>녹음 시각</th>
                  <td>{new Date(pledge.recording.recordedAt).toLocaleString("ko-KR")}</td>
                </tr>
                <tr>
                  <th>길이</th>
                  <td>
                    {pledge.recording.durationMs
                      ? `${Math.round(pledge.recording.durationMs / 1000)}초`
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <th>파일 지문(SHA-256)</th>
                  <td style={{ fontSize: 12, wordBreak: "break-all", fontWeight: 500 }}>
                    {pledge.recording.sha256}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint">
              이 지문은 파일이 나중에 바뀌지 않았음을 확인할 때 씁니다.
            </p>
          </>
        ) : (
          <p className="text-muted" style={{ fontSize: 14 }}>아직 녹음이 없어요.</p>
        )}
      </Card>

      <Card title="들으면서 확인해주세요" subtitle="다섯 가지가 모두 녹음에 들어 있어야 해요">
        <div className="consent-list">
          {items.map((item) => (
            <label key={item.key} className={`consent-row${checked[item.key] ? " on" : ""}`}>
              <input
                type="checkbox"
                checked={Boolean(checked[item.key])}
                onChange={() => setChecked((c) => ({ ...c, [item.key]: !c[item.key] }))}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        {allChecked ? (
          <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 18 }} onClick={save} disabled={busy}>
            {busy ? "저장 중..." : "모두 확인했어요"}
          </button>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 14 }}>
              하나라도 빠졌다면 저장하지 말고 처음부터 다시 녹음해주세요.
            </p>
            <button
              className="btn btn-secondary btn-block btn-lg"
              style={{ marginTop: 8 }}
              onClick={redo}
              disabled={busy}
            >
              {busy ? "준비 중..." : "녹음 다시 하기"}
            </button>
            <p className="hint">
              이미 저장된 녹음은 고칠 수 없어서, 같은 내용으로 녹음을 새로 합니다.
              대본·증인과 <strong>이미 마친 기부 의사 등록은 그대로 유지</strong>되므로
              서명 요청 메일이 다시 가지 않아요.
            </p>
          </>
        )}
      </Card>
    </Layout>
  );
}
