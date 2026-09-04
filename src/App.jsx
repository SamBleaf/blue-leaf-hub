import React, { Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RoleRoute from "./components/RoleRoute.jsx";
import RootRedirect from "./components/RootRedirect.jsx";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { BlueprintProvider } from "./lib/BlueprintContext.jsx";
import { ProjectProvider } from "./lib/ProjectContext.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import RfqEngine from "./pages/RfqEngine.jsx";
import Signup from "./pages/Signup.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import FieldLayout from "./pages/field/FieldLayout.jsx";
import FieldHome from "./pages/field/FieldHome.jsx";
import FieldJobs from "./pages/field/FieldJobs.jsx";
import FieldTasks from "./pages/field/FieldTasks.jsx";
import FieldWHS from "./pages/field/FieldWHS.jsx";
import FieldDiary from "./pages/field/FieldDiary.jsx";
import MyPortal from "./pages/MyPortal.jsx";
import SettingsLayout from "./pages/settings/SettingsLayout.jsx";
import SettingsCategory from "./pages/settings/SettingsCategory.jsx";
import Subcontractors from "./pages/Subcontractors.jsx";
import TenderBoard from "./pages/TenderBoard.jsx";
import TenderDetail from "./pages/TenderDetail.jsx";
import QuoteInbox from "./pages/QuoteInbox.jsx";
import OperationsList from "./pages/OperationsList.jsx";
import Procurement from "./pages/Procurement.jsx";
import OperationsProjectDetail from "./pages/OperationsProjectDetail.jsx";
import ScheduleManager from "./pages/ScheduleManager.jsx";
import WhsManager from "./pages/WhsManager.jsx";
import WhsEngine from "./pages/WhsEngine.jsx";
import SiteDiary from "./pages/SiteDiary.jsx";
import SiteInduction from "./pages/SiteInduction.jsx";
import CostIntelligence from "./pages/CostIntelligence.jsx";
import FeeProposalList from "./pages/FeeProposalList.jsx";
import FeeProposalWizard from "./pages/FeeProposalWizard.jsx";
import FeeProposalTemplateGuide from "./pages/FeeProposalTemplateGuide.jsx";
import SalesPipeline from "./pages/SalesPipeline.jsx";
import SalesManager from "./pages/SalesManager.jsx";
import LeadDetail from "./pages/LeadDetail.jsx";
import ReferenceProjects from "./pages/ReferenceProjects.jsx";
import FinanceManager from "./pages/FinanceManager.jsx";
import JobCommandCentre from "./pages/JobCommandCentre.jsx";
import JobDashboardSelector from "./pages/JobDashboardSelector.jsx";
import SupervisorHome from "./pages/SupervisorHome.jsx";
import PortalAdmin from "./pages/PortalAdmin.jsx";
const PortalV2Admin = React.lazy(() => import("./pages/PortalV2Admin.jsx"));
import RfqPackageList from "./pages/RfqPackageList.jsx";
const MarketingRouter = React.lazy(() => import("./components/marketing/MarketingRouter.jsx"));
import Workforce from "./pages/Workforce.jsx";
import WorkerHome from "./pages/worker/WorkerHome.jsx";
import WorkerLogHours from "./pages/worker/WorkerLogHours.jsx";
import WorkerRequestDayOff from "./pages/worker/WorkerRequestDayOff.jsx";
import WorkerTasks from "./pages/worker/WorkerTasks.jsx";
import WorkerWeek from "./pages/worker/WorkerWeek.jsx";
import CarpentryDashboard from "./pages/CarpentryDashboard.jsx";
import CarpentryJobDetail from "./pages/CarpentryJobDetail.jsx";
import ConfirmQueue from "./pages/ConfirmQueue.jsx";

const PortalApp = React.lazy(() => import("./pages/portal/PortalApp.jsx"));

// ── Client Portal v2.0 (logged-in clients; role === "client") ────────────────
const ClientPortalLayout = React.lazy(() => import("./pages/clientportal/ClientPortalLayout.jsx"));
const ClientHome = React.lazy(() => import("./pages/clientportal/ClientHome.jsx"));
const ClientActions = React.lazy(() => import("./pages/clientportal/ClientActions.jsx"));
const ClientJourney = React.lazy(() => import("./pages/clientportal/ClientJourney.jsx"));
const ClientSelections = React.lazy(() => import("./pages/clientportal/ClientSelections.jsx"));
const ClientDocuments = React.lazy(() => import("./pages/clientportal/ClientDocuments.jsx"));
const ClientMessages = React.lazy(() => import("./pages/clientportal/ClientMessages.jsx"));
const ClientDesignTeam = React.lazy(() => import("./pages/clientportal/ClientDesignTeam.jsx"));
const ClientMyHome = React.lazy(() => import("./pages/clientportal/ClientMyHome.jsx"));
// Review-only index at /ui-review — gated so production tree-shakes it out entirely.
const UiReviewIndex =
  import.meta.env.VITE_UI_REVIEW_MODE === "true"
    ? React.lazy(() => import("./ui-review/UiReviewIndex.jsx"))
    : null;
// Review-only Sales redesign mock-up (Pass 2/3 design direction). Gated → tree-shaken from prod.
const SalesRedesignMockup =
  import.meta.env.VITE_UI_REVIEW_MODE === "true"
    ? React.lazy(() => import("./ui-review/pages/SalesRedesignMockup.jsx"))
    : null;
// Review-only Operations + Schedule redesign mock-up (H2 design direction). Gated → tree-shaken from prod.
const OpsRedesignMockup =
  import.meta.env.VITE_UI_REVIEW_MODE === "true"
    ? React.lazy(() => import("./ui-review/pages/OpsRedesignMockup.jsx"))
    : null;
// Review-only Tender/RFQ + Procurement redesign mock-up (H3 design direction). Gated → tree-shaken from prod.
const H3RedesignMockup =
  import.meta.env.VITE_UI_REVIEW_MODE === "true"
    ? React.lazy(() => import("./ui-review/pages/H3RedesignMockup.jsx"))
    : null;

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <BlueprintProvider>
          <ProjectProvider>
          <Routes>
            <Route path="/induct/:projectId" element={<SiteInduction />} />
            <Route
              path="/portal/:token/*"
              element={
                <Suspense fallback={<div className="min-h-screen bg-page" />}>
                  <PortalApp />
                </Suspense>
              }
            />
            <Route path="/worker" element={<WorkerHome />} />
            <Route path="/worker/timesheet/log" element={<WorkerLogHours />} />
            <Route path="/worker/day-off" element={<WorkerRequestDayOff />} />
            <Route path="/worker/tasks" element={<WorkerTasks />} />
            <Route path="/worker/week" element={<WorkerWeek />} />
            {UiReviewIndex && (
              <Route
                path="/ui-review"
                element={
                  <Suspense fallback={<div className="min-h-screen bg-page" />}>
                    <UiReviewIndex />
                  </Suspense>
                }
              />
            )}
            {SalesRedesignMockup && (
              <Route
                path="/ui-review/sales-redesign-mockup/*"
                element={
                  <Suspense fallback={<div className="min-h-screen bg-page" />}>
                    <SalesRedesignMockup />
                  </Suspense>
                }
              />
            )}
            {OpsRedesignMockup && (
              <Route
                path="/ui-review/ops-redesign-mockup/*"
                element={
                  <Suspense fallback={<div className="min-h-screen bg-page" />}>
                    <OpsRedesignMockup />
                  </Suspense>
                }
              />
            )}
            {H3RedesignMockup && (
              <Route
                path="/ui-review/h3-redesign-mockup/*"
                element={
                  <Suspense fallback={<div className="min-h-screen bg-page" />}>
                    <H3RedesignMockup />
                  </Suspense>
                }
              />
            )}
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/accept-invite/:token" element={<AcceptInvite />} />
            <Route path="/" element={<RootRedirect />} />

            <Route element={<ProtectedRoute />}>
              <Route
                path="/my-portal"
                element={<RoleRoute element={<MyPortal />} allowed={["client"]} redirectTo="/login" />}
              />
              <Route path="/supervisor" element={<SupervisorHome />} />

              {/* ── Client Portal v2.0 — own layout (not AppShell); layout enforces role === "client" ── */}
              <Route
                path="/client-portal"
                element={
                  <Suspense fallback={<div className="min-h-screen bg-page" />}>
                    <ClientPortalLayout />
                  </Suspense>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientHome />
                    </Suspense>
                  }
                />
                <Route
                  path="actions"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientActions />
                    </Suspense>
                  }
                />
                <Route
                  path="journey"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientJourney />
                    </Suspense>
                  }
                />
                <Route
                  path="selections"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientSelections />
                    </Suspense>
                  }
                />
                <Route
                  path="documents"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientDocuments />
                    </Suspense>
                  }
                />
                <Route
                  path="messages"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientMessages />
                    </Suspense>
                  }
                />
                <Route
                  path="design-team"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientDesignTeam />
                    </Suspense>
                  }
                />
                <Route
                  path="my-home"
                  element={
                    <Suspense fallback={<div className="min-h-[40vh]" />}>
                      <ClientMyHome />
                    </Suspense>
                  }
                />
              </Route>

              {/* A5 — mobile field app (own shell, not AppShell). Admin allowed for preview. */}
              <Route
                path="/field"
                element={<RoleRoute element={<FieldLayout />} allowed={["admin", "supervisor", "employee"]} redirectTo="/home" />}
              >
                <Route index element={<FieldHome />} />
                <Route path="jobs" element={<FieldJobs />} />
                <Route path="tasks" element={<FieldTasks />} />
                <Route path="whs" element={<FieldWHS />} />
                <Route path="diary" element={<FieldDiary />} />
              </Route>

              <Route element={<AppShell />}>
                {/* ── Settings hub: left category rail + nested content pane ────────────
                    Layout itself allows admin + supervisor (supervisor only needs Workforce
                    rules), then every child re-gates to the role list it had before this
                    refactor — most stay admin-only; only workforce-rules opens to supervisor. */}
                <Route
                  path="/settings"
                  element={<RoleRoute element={<SettingsLayout />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                >
                  <Route index element={<Navigate to="general" replace />} />
                  <Route
                    path="general"
                    element={<RoleRoute element={<SettingsCategory cat="general" />} allowed={["admin"]} redirectTo="/home" />}
                  />
                  <Route
                    path="team"
                    element={<RoleRoute element={<SettingsCategory cat="team" />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                  />
                  <Route
                    path="integrations"
                    element={<RoleRoute element={<SettingsCategory cat="integrations" />} allowed={["admin"]} redirectTo="/home" />}
                  />
                  <Route
                    path="modules"
                    element={<RoleRoute element={<SettingsCategory cat="modules" />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                  />
                  <Route
                    path="usage"
                    element={<RoleRoute element={<SettingsCategory cat="usage" />} allowed={["admin"]} redirectTo="/home" />}
                  />
                  <Route
                    path="account"
                    element={<RoleRoute element={<SettingsCategory cat="account" />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                  />
                </Route>

                <Route
                  path="/home"
                  element={
                    <RoleRoute element={<Home />} allowed={["admin", "supervisor", "employee"]} redirectTo="/operations" />
                  }
                />
                <Route
                  path="/tender-manager"
                  element={<RoleRoute element={<Outlet />} allowed={["admin"]} redirectTo="/home" />}
                >
                  <Route index element={<Navigate to="/tender-manager/board" replace />} />
                  <Route path="rfq-engine" element={<RfqEngine />} />
                  <Route path="rfq-packages" element={<RfqPackageList />} />
                  <Route path="subcontractors" element={<Subcontractors />} />
                  <Route path="quote-tracker" element={<Navigate to="/tender-manager/rfq-packages" replace />} />
                  <Route path="settings" element={<Navigate to="/settings/general" replace />} />
                  <Route path="board" element={<TenderBoard />} />
                  <Route path="board/:jobId" element={<TenderDetail />} />
                  <Route path="quote-inbox" element={<QuoteInbox />} />
                  <Route path="cost-intelligence" element={<CostIntelligence />} />
                  <Route path="fee-proposal" element={<FeeProposalList />} />
                  <Route path="fee-proposal/new" element={<FeeProposalWizard />} />
                  <Route path="fee-proposal/template-setup" element={<FeeProposalTemplateGuide />} />
                  <Route path="fee-proposal/:id" element={<FeeProposalWizard />} />
                </Route>

                <Route path="/operations" element={<OperationsList />} />
                <Route path="/operations/site" element={<Navigate to="/operations" replace />} />
                <Route path="/operations/procurement" element={<Procurement />} />
                <Route path="/operations/:projectId" element={<OperationsProjectDetail />} />
                <Route path="/operations/:projectId/schedule" element={<ScheduleManager />} />
                <Route path="/operations/:projectId/whs" element={<WhsManager />} />
                <Route path="/operations/:projectId/whs-setup" element={<WhsEngine />} />
                <Route path="/operations/:projectId/diary" element={<SiteDiary />} />

                <Route
                  path="/sales"
                  element={<RoleRoute element={<SalesPipeline />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/sales/dashboard"
                  element={<RoleRoute element={<SalesManager />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/sales/contacts"
                  element={<RoleRoute element={<SalesManager />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/sales/reference-projects"
                  element={<RoleRoute element={<ReferenceProjects />} allowed={["admin"]} redirectTo="/home" />}
                />
                {/* Guard: /sales/pipeline would otherwise match :leadId and trigger a UUID parse error */}
                <Route path="/sales/pipeline" element={<Navigate to="/sales" replace />} />
                <Route
                  path="/sales/:leadId"
                  element={<RoleRoute element={<LeadDetail />} allowed={["admin"]} redirectTo="/home" />}
                />

                <Route
                  path="/finance"
                  element={<RoleRoute element={<FinanceManager />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/finance/jobs"
                  element={<RoleRoute element={<JobDashboardSelector forcePortfolio />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/finance/jobs/:jobId"
                  element={<RoleRoute element={<JobCommandCentre />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/finance/:tab"
                  element={<RoleRoute element={<FinanceManager />} allowed={["admin"]} redirectTo="/home" />}
                />

                <Route
                  path="/marketing/*"
                  element={
                    <RoleRoute
                      element={
                        <Suspense fallback={<div className="min-h-screen bg-page" />}>
                          <MarketingRouter />
                        </Suspense>
                      }
                      allowed={["admin"]}
                      redirectTo="/home"
                    />
                  }
                />

                <Route
                  path="/workforce"
                  element={<RoleRoute element={<Workforce />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                />
                <Route
                  path="/workforce/team"
                  element={<RoleRoute element={<Navigate to="/workforce?tab=Team" replace />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                />

                <Route
                  path="/portal-admin"
                  element={<RoleRoute element={<PortalAdmin />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/portal-admin/:projectId"
                  element={<RoleRoute element={<PortalAdmin />} allowed={["admin"]} redirectTo="/home" />}
                />
                <Route
                  path="/portal-admin/:projectId/v2"
                  element={<RoleRoute element={<PortalV2Admin />} allowed={["admin"]} redirectTo="/home" />}
                />

                <Route
                  path="/carpentry"
                  element={<RoleRoute element={<CarpentryDashboard />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                />
                <Route
                  path="/carpentry/:jobId"
                  element={<RoleRoute element={<CarpentryJobDetail />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                />

                <Route
                  path="/confirm-queue"
                  element={<RoleRoute element={<ConfirmQueue />} allowed={["admin", "supervisor"]} redirectTo="/home" />}
                />

                <Route path="/rfq-engine" element={<Navigate to="/tender-manager/rfq-engine" replace />} />
                <Route path="/subcontractors" element={<Navigate to="/tender-manager/subcontractors" replace />} />
                <Route path="/quote-tracker" element={<Navigate to="/tender-manager/quote-tracker" replace />} />
                <Route path="/cost-intelligence" element={<Navigate to="/tender-manager/cost-intelligence" replace />} />
                {/* Old bookmark: standalone templates page (now the Templates sub-section of
                    /settings/modules). The /tender-manager/settings redirect lives inside the
                    /tender-manager block above. */}
                <Route path="/documents-templates" element={<Navigate to="/settings/modules" replace />} />
                {/* Old bookmarks: these sub-panes used to be their own routes; now they're
                    sub-sections within a category page. */}
                <Route path="/settings/users" element={<Navigate to="/settings/team" replace />} />
                <Route path="/settings/data-cleanup" element={<Navigate to="/settings/usage" replace />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ProjectProvider>
        </BlueprintProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
