import { Routes, Route, Navigate } from "react-router-dom";
import Onboarding from "./pages/Onboarding.jsx";
import Home from "./pages/Home.jsx";
import MyPage from "./pages/MyPage.jsx";
import Profile from "./pages/Profile.jsx";
import DonationTypeSelect from "./pages/DonationTypeSelect.jsx";
import HometownGuide from "./pages/HometownGuide.jsx";
import HeritageSupport from "./pages/HeritageSupport.jsx";
import LegacyIntro from "./pages/legacy/LegacyIntro.jsx";
import LegacyPrograms from "./pages/legacy/LegacyPrograms.jsx";
import LegacyChat from "./pages/legacy/LegacyChat.jsx";
import LegacyScript from "./pages/legacy/LegacyScript.jsx";
import LegacySign from "./pages/legacy/LegacySign.jsx";
import LegacyWitness from "./pages/legacy/LegacyWitness.jsx";
import LegacyRecord from "./pages/legacy/LegacyRecord.jsx";
import LegacyReview from "./pages/legacy/LegacyReview.jsx";
import LegacyDone from "./pages/legacy/LegacyDone.jsx";
import ProgramList from "./pages/ProgramList.jsx";
import ChatStart from "./pages/ChatStart.jsx";
import ChatConversation from "./pages/ChatConversation.jsx";
import AgreementConfirm from "./pages/AgreementConfirm.jsx";
import SignerInfo from "./pages/SignerInfo.jsx";
import AgreementWait from "./pages/AgreementWait.jsx";
import Documents from "./pages/Documents.jsx";
import DocumentView from "./pages/DocumentView.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="/home" element={<Home />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/donate/type" element={<DonationTypeSelect />} />
      <Route path="/donate/hometown" element={<HometownGuide />} />
      <Route path="/donate/heritage" element={<HeritageSupport />} />
      {/* 유산기부는 정기기부와 다른 전용 흐름을 탄다 (LEGACY_PLAN.md §1) */}
      <Route path="/donate/legacy" element={<LegacyIntro />} />
      <Route path="/donate/legacy/programs" element={<LegacyPrograms />} />
      <Route path="/donate/legacy/:programId/chat" element={<LegacyChat />} />
      <Route path="/donate/legacy/:programId/script" element={<LegacyScript />} />
      <Route path="/donate/legacy/:programId/sign" element={<LegacySign />} />
      <Route path="/legacy/:pledgeId/witness" element={<LegacyWitness />} />
      <Route path="/legacy/:pledgeId/record" element={<LegacyRecord />} />
      <Route path="/legacy/:pledgeId/review" element={<LegacyReview />} />
      <Route path="/legacy/:pledgeId/done" element={<LegacyDone />} />
      <Route path="/programs" element={<ProgramList />} />
      <Route path="/programs/:programId/start" element={<ChatStart />} />
      <Route path="/programs/:programId/chat" element={<ChatConversation />} />
      <Route path="/programs/:programId/confirm" element={<AgreementConfirm />} />
      <Route path="/programs/:programId/signer" element={<SignerInfo />} />
      <Route path="/agreements/:agreementId" element={<AgreementWait />} />
      <Route path="/documents" element={<Documents />} />
      <Route path="/documents/:documentId" element={<DocumentView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
