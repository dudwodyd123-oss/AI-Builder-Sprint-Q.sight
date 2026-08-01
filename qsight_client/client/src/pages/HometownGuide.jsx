import { useState } from "react";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";

const CITIES = ["강원 양양군", "전남 담양군", "경북 의성군", "충남 청양군", "제주 서귀포시"];

/**
 * 고향사랑기부 안내.
 *
 * 지자체 데이터는 추후 별도로 연동할 예정이라 화면과 입력 폼은 그대로 두고,
 * 접수(약정 생성)만 막아둔다. 데이터가 붙으면 이 자리에 연결하면 된다.
 */
export default function HometownGuide() {
  const [form, setForm] = useState({
    target: CITIES[0],
    amount: "",
    donorName: "",
    donorPhone: "",
  });

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Layout title="고향사랑기부 안내" subtitle="제2의 고향에 마음을 전해보세요">
      <Card title="고향사랑기부제란?" subtitle="지자체에 기부하고 답례품과 세액공제를 받는 제도예요.">
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.8 }}>
          <li>연간 최대 500만원까지 기부할 수 있어요.</li>
          <li>기부금액의 30% 이내에서 지역 특산품 등 답례품을 받아요.</li>
          <li>10만원까지 전액, 초과분은 16.5% 세액공제가 적용돼요.</li>
        </ul>
      </Card>

      <Card title="기부 신청하기">
        <div className="alert alert-info">
          고향사랑기부 접수는 준비 중이에요. 지자체 연동이 완료되면 이곳에서 바로 신청할 수 있어요.
        </div>
        <div className="field">
          <label>기부할 지자체</label>
          <select value={form.target} onChange={update("target")}>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>기부 금액 (원)</label>
          <input type="number" min="10000" step="10000" placeholder="예: 100000" value={form.amount} onChange={update("amount")} />
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
