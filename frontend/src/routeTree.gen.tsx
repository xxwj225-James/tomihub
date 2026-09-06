import { createRootRoute, createRoute, Navigate, redirect } from '@tanstack/react-router';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { TenantSelectPage } from './pages/TenantSelectPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { IssuesPage } from './pages/IssuesPage';
import { IssueDetailPage } from './pages/IssueDetailPage';
import { CreateIssuePage } from './pages/CreateIssuePage';
import { ProfilePage } from './pages/ProfilePage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { BatchMonitorPage } from './pages/BatchMonitorPage';
import { ActivityListPage } from './pages/ActivityListPage';
import { McpAuditPage } from './pages/MCPAuditPage';
import { SetupWizardPage } from './pages/SetupWizardPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { CreateProjectPage } from './pages/CreateProjectPage';
import { WikiListPage } from './pages/WikiListPage';
import { WikiEditorPage } from './pages/WikiEditorPage';
import { GanttPage } from './pages/GanttPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { useAuthStore } from './stores/authStore';
import { useProjectStore } from './stores/projectStore';
import { AppLayout } from './components/layout/AppLayout';

const rootRoute = createRootRoute();

// Public routes — no layout
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/register', component: RegisterPage });
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/forgot-password', component: ForgotPasswordPage });
const joinRoute = createRoute({ getParentRoute: () => rootRoute, path: '/join', component: AcceptInvitePage });

// Authenticated layout — redirects to /login if not authenticated, /setup-wizard if onboarding not done
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: () => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated) {
      // replace keeps the protected page in history; the redirect param
      // restores it after login (LoginPage navigates back with replace)
      throw redirect({
        to: '/login',
        replace: true,
        search: { redirect: window.location.pathname + window.location.search },
      });
    }
    // New users must complete setup wizard before accessing the app
    if (user?.onboardingCompleted === false) {
      throw redirect({ to: '/setup-wizard' });
    }
  },
  component: AppLayout,
});

// Placeholder page for sections not yet built
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-ink-primary mb-2">{title}</h2>
      <p className="text-sm text-ink-muted">This section is coming soon.</p>
    </div>
  );
}
import { BoardPage as BoardPageComp } from '@/pages/BoardPage';
function BoardPage() { return <BoardPageComp />; }
import { SprintsPage } from './pages/SprintsPage';
import { BacklogPage } from './pages/BacklogPage';
import { SprintPlanningPage } from './pages/SprintPlanningPage';
import { SettingsPage as SettingsPageComp } from '@/pages/SettingsPage';
function SettingsPage() { return <SettingsPageComp />; }
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { MembersPage } from '@/pages/MembersPage';
import { ProjectOverviewPage } from '@/pages/ProjectOverviewPage';
import { ProjectKnowledgePage } from '@/pages/ProjectKnowledgePage';
import { ReportPage } from '@/pages/ReportPage';
import { CabinListPage } from '@/pages/CabinListPage';
function AdminSettings() { return <AdminSettingsPage />; }
function RolesPage() { return <PlaceholderPage title="Roles & Permissions" />; }
function ChatOpsPage() { return <PlaceholderPage title="ChatOps" />; }

const homeRoute = createRoute({ getParentRoute: () => appRoute, path: '/home', component: HomePage });
const createProjectRoute = createRoute({ getParentRoute: () => appRoute, path: '/projects/new', component: CreateProjectPage });
// Standalone (no AppLayout/sidebar) — requires auth for API calls
const setupWizardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup-wizard',
  beforeLoad: () => {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated) throw redirect({
      to: '/login',
      replace: true,
      search: { redirect: window.location.pathname + window.location.search },
    });
    // Already completed — skip wizard
    const setupDone = user?.onboardingCompleted === true;
    if (setupDone) throw redirect({ to: '/home' });
  },
  component: SetupWizardPage,
});
const tenantSelectRoute = createRoute({ getParentRoute: () => appRoute, path: '/select-tenant', component: TenantSelectPage });

// Project-scoped routes
const boardRoute = createRoute({ getParentRoute: () => appRoute, path: '/board', component: BoardPage });
const issuesRoute = createRoute({ getParentRoute: () => appRoute, path: '/issues', component: IssuesPage });
const issueDetailRoute = createRoute({ getParentRoute: () => appRoute, path: '/issues/$id', component: IssueDetailPage });
const createIssueRoute = createRoute({ getParentRoute: () => appRoute, path: '/issues/new', component: CreateIssuePage });
const sprintsRoute = createRoute({ getParentRoute: () => appRoute, path: '/sprints', component: SprintsPage });
const backlogRoute = createRoute({ getParentRoute: () => appRoute, path: '/backlog', component: BacklogPage });
const sprintPlanningRoute = createRoute({ getParentRoute: () => appRoute, path: '/sprints/planning', component: SprintPlanningPage });
const ganttRoute = createRoute({ getParentRoute: () => appRoute, path: '/gantt', component: GanttPage });
const releasesRoute = createRoute({ getParentRoute: () => appRoute, path: '/releases', component: ReleasesPage });
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: '/settings', component: SettingsPage });

// AI section
const reportsRoute = createRoute({ getParentRoute: () => appRoute, path: '/reports', component: ReportPage });

// Admin-only route guard — owner/admin only, redirected to /home otherwise.
// Demo visitors are members and must NOT reach the admin section.
function requireAdmin() {
  const { currentTenant } = useAuthStore.getState();
  const role = currentTenant?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw redirect({ to: '/home' });
  }
}

// Admin section
const membersRoute = createRoute({ getParentRoute: () => appRoute, path: '/members', beforeLoad: requireAdmin, component: MembersPage });
const projectOverviewRoute = createRoute({ getParentRoute: () => appRoute, path: '/project-overview', component: ProjectOverviewPage });
const projectKnowledgeRoute = createRoute({ getParentRoute: () => appRoute, path: '/project-knowledge', component: ProjectKnowledgePage });
const adminSettingsRoute = createRoute({ getParentRoute: () => appRoute, path: '/admin-settings', beforeLoad: requireAdmin, component: AdminSettings });
const cabinsRoute = createRoute({ getParentRoute: () => appRoute, path: '/cabins', beforeLoad: requireAdmin, component: CabinListPage });
const rolesRoute = createRoute({ getParentRoute: () => appRoute, path: '/roles', beforeLoad: requireAdmin, component: RolesPage });
const apiKeysRoute = createRoute({ getParentRoute: () => appRoute, path: '/api-keys', component: ApiKeysPage });
const chatOpsRoute = createRoute({ getParentRoute: () => appRoute, path: '/chatops', beforeLoad: requireAdmin, component: ChatOpsPage });
const batchMonitorRoute = createRoute({ getParentRoute: () => appRoute, path: '/batch-monitor', beforeLoad: requireAdmin, component: BatchMonitorPage });
const activityLogRoute = createRoute({ getParentRoute: () => appRoute, path: '/activity-log', beforeLoad: requireAdmin, component: ActivityListPage });

// Account section
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/profile', component: ProfilePage });
const mcpAuditRoute = createRoute({ getParentRoute: () => appRoute, path: '/mcp-audit', component: McpAuditPage });

// Wiki — uses current project from store
function WikiListWrapper() { const pId = useProjectStore(s => s.currentProject?.id) || 'default'; return <WikiListPage projectId={pId} />; }
function WikiNewWrapper() { const pId = useProjectStore(s => s.currentProject?.id) || 'default'; return <WikiEditorPage projectId={pId} />; }
function WikiEditWrapper() { const pId = useProjectStore(s => s.currentProject?.id) || 'default'; return <WikiEditorPage projectId={pId} />; }
const wikiListRoute = createRoute({ getParentRoute: () => appRoute, path: '/wiki', component: WikiListWrapper });
const wikiNewRoute = createRoute({ getParentRoute: () => appRoute, path: '/wiki/new', component: WikiNewWrapper });
const wikiEditRoute = createRoute({ getParentRoute: () => appRoute, path: '/wiki/$id', component: WikiEditWrapper });

// Index redirect — straight to home (authenticated) or login
function IndexRedirect() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return <Navigate to={isAuth ? '/home' : '/login'} />;
}
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: IndexRedirect });

export const routeTree = rootRoute.addChildren([
  indexRoute, loginRoute, registerRoute, forgotRoute, joinRoute, setupWizardRoute,
  appRoute.addChildren([
    homeRoute, createProjectRoute, tenantSelectRoute,
    boardRoute, backlogRoute, issuesRoute, issueDetailRoute, createIssueRoute, sprintsRoute, sprintPlanningRoute, ganttRoute, releasesRoute, settingsRoute, adminSettingsRoute,
    reportsRoute,
    cabinsRoute, membersRoute, rolesRoute, apiKeysRoute, chatOpsRoute, batchMonitorRoute, activityLogRoute, projectOverviewRoute, projectKnowledgeRoute,
    profileRoute, mcpAuditRoute,
    wikiListRoute, wikiNewRoute, wikiEditRoute,
  ]),
]);
