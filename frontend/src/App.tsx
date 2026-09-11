import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MainLayout } from '@/layouts/MainLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Portfolios } from '@/pages/Portfolios';
import { PortfolioDetail } from '@/pages/PortfolioDetail';
import { StockDetail } from '@/pages/StockDetail';
import { Market } from '@/pages/Market';
import { Settings } from '@/pages/Settings';
import { NotFound } from '@/pages/NotFound';
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

      {/* Main layout wraps all app routes */}
      <Route element={<MainLayout />}>
        <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
        <Route path={ROUTES.PORTFOLIOS} element={<Portfolios />} />
        <Route path={ROUTES.PORTFOLIO_DETAIL} element={<PortfolioDetail />} />
        <Route path={ROUTES.STOCK_DETAIL} element={<StockDetail />} />
        <Route path={ROUTES.MARKET} element={<Market />} />
        <Route path={ROUTES.MARKET_STOCK} element={<StockDetail />} />
        <Route path={ROUTES.SETTINGS} element={<Settings />} />
      </Route>

      <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
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
