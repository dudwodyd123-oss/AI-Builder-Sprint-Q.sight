import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { toSummaryRows, isFilled } from "../format.js";

/**
 * 약정 내용 최종 확인.
 *
 * LLM을 호출하지 않는다. 챗봇이 수집·정규화한 values를 스키마 순서대로 표에 정리해
 * 보여주고, 사용자가 맞다고 확인하면 서명자 정보 입력으로 넘어간다.
 */
export default function AgreementConfirm() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { form, values } = usePledgeFlow();

  const fields = form?.fields || [];
  const rows = toSummaryRows(fields, values);
  // 기관이 서식에 미리 채워둔 항목. 기부자가 바꿀 수 없어 챗봇도 묻지 않는다.
  const prefilled = form?.prefilled_labels || [];
  const missingRequired = fields.filter((f) => f.required && !isFilled(values[f.key]));

  // 대화를 거치지 않고 직접 들어온 경우 챗봇으로 돌려보낸다
  useEffect(() => {
    if (!form || fields.length === 0) {
      navigate(`/programs/${programId}/chat`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  if (!form || fields.length === 0) return null;

  return (
    <Layout title="입력 내용 확인" subtitle="약정서에 들어갈 내용이에요. 틀린 곳이 없는지 확인해주세요">
      <Card>
        <div className="alert alert-info" style={{ marginBottom: 0 }}>
          다시 한번 확인할게요! 아래 내용으로 약정서가 작성되고, 확인 후 서명 요청 메일이 발송돼요.
        </div>
      </Card>

      <Card title={form.program_name} subtitle="수집된 약정 내용">
        <table className="info-table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th>
                  {row.label}
                  {/* 라벨 자체에 필수/선택 표기가 있으면 중복해서 붙이지 않는다 */}
                  {!row.required && !/필수|선택/.test(row.label) && (
                    <span className="text-muted" style={{ fontWeight: 400 }}> (선택)</span>
                  )}
                </th>
                <td>
                  {row.text !== null ? (
                    row.text
                  ) : (
                    <span className="text-muted">미입력</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {prefilled.length > 0 && (
          <>
            <p className="hint" style={{ marginTop: 20, marginBottom: 8 }}>
              아래는 기관이 계약서에 미리 정해둔 항목이에요. 수정할 수 없어요.
            </p>
            <table className="info-table">
              <tbody>
                {prefilled.map((p) => (
                  <tr key={p.key}>
                    <th>{p.label || p.key}</th>
                    <td>
                      {p.value ? (
                        p.value
                      ) : (
                        <span className="text-muted">기관에서 작성 예정</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {missingRequired.length > 0 && (
          <div className="alert alert-danger" style={{ marginTop: 16 }}>
            아직 비어 있는 필수 항목이 있어요: {missingRequired.map((f) => f.label).join(", ")}
          </div>
        )}

        <div className="gap-12 mt-24">
          <button className="btn btn-ghost" onClick={() => navigate(`/programs/${programId}/chat`)}>
            대화로 돌아가 수정하기
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => navigate(`/programs/${programId}/signer`)}
            disabled={missingRequired.length > 0}
          >
            네, 맞아요. 다음 단계로
          </button>
        </div>
      </Card>
    </Layout>
  );
}
