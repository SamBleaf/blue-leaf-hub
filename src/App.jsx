import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RootRedirect from "./components/RootRedirect.jsx";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { BlueprintProvider } from "./lib/BlueprintContext.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import QuoteTracker from "./pages/QuoteTracker.jsx";
import RfqEngine from "./pages/RfqEngine.jsx";
import Signup from "./pages/Signup.jsx";
import Settings from "./pages/Settings.jsx";
import Subcontractors from "./pages/Subcontractors.jsx";
import TenderBoard from "./pages/TenderBoard.jsx";
import TenderDetail from "./pages/TenderDetail.jsx";
import OperationsList from "./pages/OperationsList.jsx";
import OperationsProjectDetail from "./pages/OperationsProjectDetail.jsx";
import ScheduleManager from "./pages/ScheduleManager.jsx";
import WhsManager from "./pages/WhsManager.jsx";
import SiteDiary from "./pages/SiteDiary.jsx";
import SiteInduction from "./pages/SiteInduction.jsx";
import CostIntelligence from "./pages/CostIntelligence.jsx";
import FeeProposalList from "./pages/FeeProposalList.jsx";
import FeeProposalWizard from "./pages/FeeProposalWizard.jsx";
import FeeProposalTemplateGuide from "./pages/FeeProposalTemplateGuide.jsx";
import SalesPipeline from "./pages/SalesPipeline.jsx";
import LeadDetail from "./pages/LeadDetail.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BlueprintProvider>
          <Routes>
            <Route path="/induct/:projectId" element={<SiteInduction />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<RootRedirect />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/home" element={<Home />} />
                <Route path="/tender-manager">
                  <Route index element={<Navigate to="/home" replace />} />
                  <Route path="rfq-engine" element={<RfqEngine />} />
                  <Route path="subcontractors" element={<Subcontractors />} />
                  <Route path="quote-tracker" element={<QuoteTracker />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="board" element={<TenderBoard />} />
                  <Route path="board/:jobId" element={<TenderDetail />} />
                  <Route path="cost-intelligence" element={<CostIntelligence />} />
                  <Route path="fee-proposal" element={<FeeProposalList />} />
                  <Route path="fee-proposal/new" element={<FeeProposalWizard />} />
                  <Route path="fee-proposal/template-setup" element={<FeeProposalTemplateGuide />} />
                  <Route path="fee-proposal/:id" element={<FeeProposalWizard />} />
                </Route>

                <Route path="/operations" element={<OperationsList />} />
                <Route path="/operations/:projectId" element={<OperationsProjectDetail />} />
                <Route path="/operations/:projectId/schedule" element={<ScheduleManager />} />
                <Route path="/operations/:projectId/whs" element={<WhsManager />} />
                <Route path="/operations/:projectId/diary" element={<SiteDiary />} />

                <Route path="/sales" element={<SalesPipeline />} />
                <Route path="/sales/:leadId" element={<LeadDetail />} />

                <Route path="/rfq-engine" element={<Navigate to="/tender-manager/rfq-engine" replace />} />
                <Route path="/subcontractors" element={<Navigate to="/tender-manager/subcontractors" replace />} />
                <Route path="/quote-tracker" element={<Navigate to="/tender-manager/quote-tracker" replace />} />
                <Route path="/settings" element={<Navigate to="/tender-manager/settings" replace />} />
                <Route path="/cost-intelligence" element={<Navigate to="/tender-manager/cost-intelligence" replace />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BlueprintProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
