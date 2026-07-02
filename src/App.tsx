import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { ComparisonList } from "@/pages/ComparisonListPage";
import { CreateComparison } from "@/pages/CreateComparisonPage";
import { SetupWizard, setupWizardLoader } from "@/pages/SetupWizardPage";
import { ComparisonDetail } from "@/pages/ComparisonDetailPage";
import { OptionsPage } from "@/pages/OptionsPage";
import { ReconfigureWizard } from "@/pages/ReconfigureWizardPage";
import { LoginPage } from "@/pages/LoginPage";
import { AdminUsersPage } from "@/pages/AdminUsersPage";
import { DevIssueReporter } from "@/shared/components/DevIssueReporter";
import { UserMenu } from "@/features/users/components/UserMenu";
import { authClient } from "@/shared/lib/auth-client";
import "./index.css";
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from "@/shared/queryClient";
import { Toaster } from "@/shared/components/ui/sonner"
import { ThemeProvider } from "@/shared/lib/theme";
import { TooltipProvider } from "@/shared/components/ui/tooltip"
import { ComparisonQueries } from '@/features/comparisons/query'
import { BackgroundRippleEffect } from "@/shared/components/ui/background-ripple-effect";

function RootLayout() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BackgroundRippleEffect />
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
                <TooltipProvider>
        <Outlet />
                </TooltipProvider>
        <Toaster />
        <UserMenu />
        {process.env.NODE_ENV !== "production" && <DevIssueReporter />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}

async function requireAuth() {
  const session = await authClient.getSession();
  if (!session?.data?.user) {
    throw redirect({ to: "/login" });
  }
}

async function requireAdmin() {
  const session = await authClient.getSession();
  if (!session?.data?.user) throw redirect({ to: "/login" });
  if (session.data.user.role !== "admin") throw redirect({ to: "/", search: { page: 1, filters: undefined } });
}

const rootRoute = createRootRoute({ component: RootLayout });

const guestRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "guest",
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session?.data?.user) {
      throw redirect({ to: "/", search: { page: 1, filters: undefined } });
    }
  },
});

const loginRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: "/login",
  component: LoginPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    page: typeof search.page === "number" ? search.page : 1,
    filters: typeof search.filters === "string" ? search.filters : undefined,
  }),
  component: ComparisonList,
});

const newComparisonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comparisons/new",
  beforeLoad: requireAuth,
  component: CreateComparison,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comparisons/$id/setup",
  beforeLoad: requireAuth,
  loader: setupWizardLoader(queryClient),
  component: SetupWizard,
});

const reconfigureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comparisons/$id/reconfigure",
  beforeLoad: requireAuth,
  component: ReconfigureWizard,
});

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comparisons/$id",
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
      const comparison = await queryClient.ensureQueryData(
        ComparisonQueries.comparison(params.id)
      );
      if (comparison?.status === "setup") {
        throw redirect({ to: "/comparisons/$id/setup", params: { id: params.id } });
      }
    },
  validateSearch: (search: Record<string, unknown>) => ({
    message: typeof search.message === "string" ? search.message : undefined,
  }),
  component: ComparisonDetail,
});

const optionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/comparisons/$id/options",
  beforeLoad: requireAuth,
  component: OptionsPage,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/users",
  beforeLoad: requireAdmin,
  component: AdminUsersPage,
});

const routeTree = rootRoute.addChildren([
  guestRoute.addChildren([loginRoute]),
  indexRoute,
  newComparisonRoute,
  setupRoute,
  optionsRoute,
  reconfigureRoute,
  detailRoute,
  adminUsersRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}

export default App;
