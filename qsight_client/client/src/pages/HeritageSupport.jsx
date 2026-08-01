import { useState } from "react";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";

const HERITAGES = ["경복궁 보존회", "불국사 문화유산 재단", "종묘 제례 보존회", "한옥마을 보존 사업"];

/**
 * 문화유산 후원.
 *
 * 후원처 데이터는 추후 별도로 연동할 예정이라 화면과 입력 폼은 그대로 두고,
 * 접수(약정 생성)만 막아둔다. 데이터가 붙으면 이 자리에 연결하면 된다.
 */
export default function HeritageSupport() {
  const [form, setForm] = useState({
    target: HERITAGES[0],
    amount: "",
    period: "매월 자동이체",
    donorName: "",
    donorPhone: "",
  });

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout title="문화유산 후원" subtitle="소중한 문화유산의 미래를 함께 지켜주세요">
      <Card title="후원 신청하기">
        <div className="alert alert-info">
          문화유산 후원 접수는 준비 중이에요. 후원처 연동이 완료되면 이곳에서 바로 신청할 수 있어요.
        </div>
        <div className="field">
          <label>후원 대상 문화유산</label>
          <select value={form.target} onChange={update("target")}>
            {HERITAGES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>후원 금액 (원)</label>
          <input type="number" min="10000" step="10000" placeholder="예: 30000" value={form.amount} onChange={update("amount")} />
        </div>
        <div className="field">
          <label>후원 주기</label>
          <select value={form.period} onChange={update("period")}>
            <option value="매월 자동이체">매월 자동이체</option>
            <option value="일시 후원">일시 후원</option>
            <option value="연 1회">연 1회</option>
          </select>
        </div>
        <div className="field">
          <label>이름</label>
          <input value={form.donorName} onChange={update("donorName")} placeholder="후원자 이름" />
        </div>
        <div className="field">
          <label>연락처</label>
          <input value={form.donorPhone} onChange={update("donorPhone")} placeholder="010-0000-0000" />
        </div>
        <button className="btn btn-primary btn-block btn-lg" disabled>
          준비 중이에요
        </button>
      </Card>
    </Layout>
  );
}
