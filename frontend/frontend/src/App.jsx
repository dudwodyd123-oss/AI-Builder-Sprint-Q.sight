import { Routes, Route, Navigate } from "react-router-dom";
import Onboarding from "./pages/Onboarding.jsx";
import Home from "./pages/Home.jsx";
import MyPage from "./pages/MyPage.jsx";
import DonationTypeSelect from "./pages/DonationTypeSelect.jsx";
import HometownGuide from "./pages/HometownGuide.jsx";
import HeritageSupport from "./pages/HeritageSupport.jsx";
import LegacyApplication from "./pages/LegacyApplication.jsx";
import ChatStart from "./pages/ChatStart.jsx";
import ChatConversation from "./pages/ChatConversation.jsx";
import PledgeConfirm from "./pages/PledgeConfirm.jsx";
import PledgeGenerate from "./pages/PledgeGenerate.jsx";
import PledgeReview from "./pages/PledgeReview.jsx";
import PledgeSign from "./pages/PledgeSign.jsx";
import Documents from "./pages/Documents.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="/home" element={<Home />} />
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/donate/type" element={<DonationTypeSelect />} />
      <Route path="/donate/hometown" element={<HometownGuide />} />
      <Route path="/donate/heritage" element={<HeritageSupport />} />
      <Route path="/donate/legacy" element={<LegacyApplication />} />
      <Route path="/chat/start" element={<ChatStart />} />
      <Route path="/chat/:type" element={<ChatConversation />} />
      <Route path="/pledge/:id/confirm" element={<PledgeConfirm />} />
      <Route path="/pledge/:id/generate" element={<PledgeGenerate />} />
      <Route path="/pledge/:id/review" element={<PledgeReview />} />
      <Route path="/pledge/:id/sign" element={<PledgeSign />} />
      <Route path="/documents" element={<Documents />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
