import React from "react";
import "@/App.css";
import "./theme-court.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing, { RegisterChoice } from "./pages/Landing";
import Profile from "./pages/Profile";
import MyEntries from "./pages/MyEntries";
import SignedDocuments from "./pages/SignedDocuments";
import ForSignature from "./pages/ForSignature";
import SubmittedDocuments from "./pages/SubmittedDocuments";
import AdminDashboard from "./pages/AdminDashboard";
import CourtDetails from "./pages/CourtDetails";
import ManageStaff from "./pages/ManageStaff";
import ManageJudges from "./pages/ManageJudges";
import { StaffDashboard, ViewEntries, ChangeCreds, DraftFinalFS } from "./pages/Staff";
import {
  JudgeLogin, JudgeDashboard, OralEvidenceHome,
  Statement183ComingSoon, OralEvidenceEntriesComingSoon, OrderComingSoon,
} from "./pages/Judge";
import DepositionWizard, { DepositionTypingPage, DepositionEditDetails } from "./pages/Deposition";
import { AdvocateHome, PleaLanguage, PleaForm, PleaSanjabi } from "./pages/Plea";
import SelectCourt from "./pages/SelectCourt";
import { PleaReview } from "./pages/PleaReview";
import { PrimaryFSCaseSelect, PrimaryFSForm, PrimaryFSReview } from "./pages/PrimaryFS";
import { FinalFSCaseSelect, FinalFSForm, FinalFSReview } from "./pages/FinalFS";
import { DocLanguage, DocForm } from "./pages/DocGenerator";
import Statement183Wizard from "./pages/Statement183";
import OralEvidenceEntries from "./pages/OralEvidenceEntries";
import { OrderHome, OrderDraftWizard, OrderEntries, OrderTemplates, OrderTemplateNew } from "./pages/Order";
import { PublicGate, AdvocateLogin, AdvocateRegister, LitigantEntry, LitigantLogin, LitigantRegister, Registrations } from "./pages/Public";
import MessageCenter from "./pages/MessageCenter";
import { StaffDemandNotifier, StaffDemands, LiveDepositionList, LiveDepositionView } from "./pages/LiveCourt";

function App() {
  return (
    <BrowserRouter>
      <StaffDemandNotifier />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<RegisterChoice />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/signed-documents" element={<SignedDocuments />} />
        <Route path="/judge-desk/for-signature" element={<ForSignature />} />
        <Route path="/court/submitted-documents" element={<SubmittedDocuments />} />
        <Route path="/advocate/my-entries" element={<MyEntries />} />
        {/* Admin */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/courts" element={<CourtDetails />} />
        <Route path="/admin/staff-users" element={<ManageStaff />} />
        <Route path="/admin/judge-users" element={<ManageJudges />} />
        {/* Judge — intentionally not linked from Landing; direct URL access only */}
        {/* Everybody, including the Judge, signs in on the NyayDwar sign-in page. */}
        <Route path="/judge-desk" element={<Navigate to="/" replace />} />
        <Route path="/judge-desk/dashboard" element={<JudgeDashboard />} />
        <Route path="/judge-desk/oral-evidence" element={<OralEvidenceHome />} />
        <Route path="/judge-desk/oral-evidence/deposition" element={<DepositionWizard />} />
        <Route path="/judge-desk/oral-evidence/deposition/type/:depId" element={<DepositionTypingPage />} />
        <Route path="/judge-desk/oral-evidence/deposition/edit/:depId" element={<DepositionEditDetails />} />
        <Route path="/judge-desk/oral-evidence/183-statement" element={<Statement183Wizard />} />
        <Route path="/judge-desk/oral-evidence/entries" element={<OralEvidenceEntries />} />
        <Route path="/judge-desk/order" element={<OrderHome />} />
        <Route path="/judge-desk/order/draft" element={<OrderDraftWizard />} />
        <Route path="/judge-desk/order/entries" element={<OrderEntries />} />
        <Route path="/judge-desk/order/templates" element={<OrderTemplates />} />
        <Route path="/judge-desk/order/templates/new" element={<OrderTemplateNew />} />
        {/* Staff */}
        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/staff/entries" element={<ViewEntries />} />
        <Route path="/staff/draft-final-fs" element={<DraftFinalFS />} />
        <Route path="/staff/change" element={<ChangeCreds />} />
        {/* Advocate / Accused */}
        <Route path="/advocate/login" element={<AdvocateLogin />} />
        <Route path="/advocate/register" element={<AdvocateRegister />} />
        <Route path="/litigant" element={<LitigantEntry />} />
        <Route path="/litigant/login" element={<LitigantLogin />} />
        <Route path="/litigant/register" element={<LitigantRegister />} />
        <Route path="/message-center" element={<MessageCenter />} />
        <Route path="/staff/demands" element={<StaffDemands />} />
        <Route path="/advocate/live" element={<LiveDepositionList />} />
        <Route path="/advocate/live/:depId" element={<LiveDepositionView />} />
        <Route path="/admin/registrations" element={<Registrations />} />
        <Route path="/staff/registrations" element={<Registrations />} />
        <Route path="/advocate" element={<PublicGate><SelectCourt /></PublicGate>} />
        <Route path="/advocate/menu" element={<PublicGate><AdvocateHome /></PublicGate>} />
        <Route path="/advocate/plea/lang" element={<PublicGate><PleaLanguage /></PublicGate>} />
        <Route path="/advocate/plea/form/:lang" element={<PublicGate><PleaForm /></PublicGate>} />
        <Route path="/advocate/plea/form/:lang/:pleaId" element={<PublicGate><PleaForm /></PublicGate>} />
        <Route path="/advocate/plea/sanjabi/:lang/:pleaId" element={<PublicGate><PleaSanjabi /></PublicGate>} />
        <Route path="/advocate/plea/review/:pleaId" element={<PublicGate><PleaReview /></PublicGate>} />
        <Route path="/advocate/primary-fs" element={<PublicGate><PrimaryFSCaseSelect /></PublicGate>} />
        <Route path="/advocate/primary-fs/form/:pleaId" element={<PublicGate><PrimaryFSForm /></PublicGate>} />
        <Route path="/advocate/primary-fs/review/:pleaId" element={<PublicGate><PrimaryFSReview /></PublicGate>} />
        <Route path="/advocate/final-fs" element={<PublicGate><FinalFSCaseSelect /></PublicGate>} />
        <Route path="/advocate/final-fs/form/:pleaId" element={<PublicGate><FinalFSForm /></PublicGate>} />
        <Route path="/advocate/final-fs/review/:pleaId" element={<PublicGate><FinalFSReview /></PublicGate>} />
        <Route path="/advocate/:kind/lang" element={<PublicGate><DocLanguage /></PublicGate>} />
        <Route path="/advocate/:kind/form/:lang" element={<PublicGate><DocForm /></PublicGate>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
