import { lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MainLayout } from '@/layouts/MainLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Login } from '@/pages/Login';
import { Signup } from '@/pages/Signup';
import { NotFound } from '@/pages/NotFound';

/**
 * Application pages are loaded per route. Before this the entry chunk carried every
 * page — and through them recharts, radix and the whole feature tree — so a signed-in
 * user downloaded the planners and the admin roster before seeing the dashboard.
 * The signed-out pages stay eager: they are the first paint for a new session.
 */
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Portfolios = lazy(() => import('@/pages/Portfolios').then((m) => ({ default: m.Portfolios })));
const PortfolioDetail = lazy(() =>
  import('@/pages/PortfolioDetail').then((m) => ({ default: m.PortfolioDetail })),
);
const StockDetail = lazy(() => import('@/pages/StockDetail').then((m) => ({ default: m.StockDetail })));
const AverageDownPlanner = lazy(() =>
  import('@/pages/AverageDownPlanner').then((m) => ({ default: m.AverageDownPlanner })),
);
const Watchlist = lazy(() => import('@/pages/Watchlist').then((m) => ({ default: m.Watchlist })));
const Alerts = lazy(() => import('@/pages/Alerts').then((m) => ({ default: m.Alerts })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const Profile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.Profile })));
const AdminUsers = lazy(() => import('@/pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
import { ROUTES } from '@/constants';
import { useTheme } from '@/hooks';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
  },
});

function AppRoutes() {
  useTheme(); // Apply theme on mount
  return (
    <Routes>
      {/* Redirect root to dashboard */}
      <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.DASHBOARD} replace />} />

      {/* Signed-out pages get their own shell: the same environment banner, none
          of the navigation. */}
      <Route element={<AuthLayout />}>
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.SIGNUP} element={<Signup />} />
      </Route>

      {/* Everything else needs an account. AuthGuard reads the session once and
          then either renders the app, sends you to sign in, or holds you on the
          profile page while a password change is outstanding. */}
      <Route element={<AuthGuard />}>
        {/* Main layout wraps all app routes — including the 404, so a mistyped URL
            still lands somewhere with navigation instead of a dead end. */}
        <Route element={<MainLayout />}>
          <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
          <Route path={ROUTES.PORTFOLIOS} element={<Portfolios />} />
          <Route path={ROUTES.PORTFOLIO_DETAIL} element={<PortfolioDetail />} />
          <Route path={ROUTES.STOCK_DETAIL} element={<StockDetail />} />
          <Route path={ROUTES.PLANNER} element={<AverageDownPlanner />} />
          {/* The standalone dividends page folded into each portfolio's Dividends
              tab; old links keep working instead of 404ing. */}
          <Route path="/dividends" element={<Navigate to={ROUTES.PORTFOLIOS} replace />} />
          <Route path={ROUTES.WATCHLIST} element={<Watchlist />} />
          <Route path={ROUTES.ALERTS} element={<Alerts />} />
          <Route path={ROUTES.SETTINGS} element={<Settings />} />
          <Route path={ROUTES.PROFILE} element={<Profile />} />
          <Route path={ROUTES.ADMIN_USERS} element={<AdminUsers />} />
          <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
