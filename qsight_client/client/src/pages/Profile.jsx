import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import Card from "../components/Card.jsx";
import { usePledgeFlow } from "../context/PledgeContext.jsx";
import { EMPTY_PROFILE, isComplete } from "../profile.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 기부자 기본정보 입력·수정 (로그인 대체).
 *
 * 처음 들어오면 입력 화면, 이미 저장돼 있으면 확인 화면으로 시작한다.
 * 여기서 받은 값은 챗봇이 같은 항목을 다시 묻지 않도록 쓰인다.
 */
export default function Profile() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile, setProfile } = usePledgeFlow();

  const first = !isComplete(profile);
  const [editing, setEditing] = useState(first);
  const [form, setForm] = useState(profile || EMPTY_PROFILE);
  const [error, setError] = useState("");

  const next = params.get("next") || "/home";
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = (e) => {
    e.preventDefault();
    const trimmed = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    };
    if (!trimmed.name || !trimmed.email || !trimmed.phone) {
      setError("이름, 이메일, 전화번호를 모두 입력해주세요.");
      return;
    }
    if (!EMAIL_RE.test(trimmed.email)) {
      setError("이메일 형식이 올바르지 않습니다.");
      return;
    }
    setError("");
    setProfile(trimmed);
    if (first) navigate(next);
    else setEditing(false);
  };

  return (
    <Layout
      title={first ? "기본정보 입력" : "내 정보"}
      subtitle={
        first
          ? "약정서에 들어갈 기본정보예요. 한 번만 입력하면 돼요"
          : "저장된 기본정보를 확인하고 수정할 수 있어요"
      }
    >
      <Card>
        {first && (
          <div className="alert alert-info">
            입력하신 정보는 이 브라우저에만 저장돼요. AI 상담사는 여기 없는 항목만 물어봐요.
          </div>
        )}
        {error && <div className="alert alert-danger">{error}</div>}

        {editing ? (
          <form onSubmit={save}>
            <div className="field">
              <label>이름</label>
              <input value={form.name} onChange={update("name")} placeholder="예: 김민준" />
            </div>
            <div className="field">
              <label>이메일</label>
              <input
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="서명 요청 메일을 받을 주소"
              />
            </div>
            <div className="field">
              <label>전화번호</label>
              <input value={form.phone} onChange={update("phone")} placeholder="010-0000-0000" />
            </div>
            <div className="gap-12">
              {!first && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setForm(profile || EMPTY_PROFILE);
                    setError("");
                    setEditing(false);
                  }}
                >
                  취소
                </button>
              )}
              <button className="btn btn-primary btn-lg">{first ? "시작하기" : "저장하기"}</button>
            </div>
          </form>
        ) : (
          <>
            <table className="info-table">
              <tbody>
                <tr>
                  <th>이름</th>
                  <td>{profile.name}</td>
                </tr>
                <tr>
                  <th>이메일</th>
                  <td>{profile.email}</td>
                </tr>
                <tr>
                  <th>전화번호</th>
                  <td>{profile.phone}</td>
                </tr>
              </tbody>
            </table>
            <div className="gap-12 mt-24">
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                정보 수정하기
              </button>
              <button className="btn btn-primary" onClick={() => navigate("/home")}>
                홈으로
              </button>
            </div>
          </>
        )}
      </Card>
    </Layout>
  );
}
