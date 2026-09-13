import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { EnvBanner, ErrorBoundary } from '@/components/shared';
import { ROUTES } from '@/constants';

const PAGE_TITLES: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'Dashboard',
  [ROUTES.PORTFOLIOS]: 'Portfolios',
  [ROUTES.MARKET]: 'Market',
  [ROUTES.SETTINGS]: 'Settings',
};

function getTitle(pathname: string): string {
  // Exact match
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Pattern matches
  if (pathname.startsWith('/portfolios/') && pathname.includes('/stocks/')) return 'Stock Details';
  if (pathname.startsWith('/portfolios/')) return 'Portfolio Details';
  if (pathname.startsWith('/market/')) return 'Stock Details';
  return 'PSX Portfolio Manager';
}

export function MainLayout() {
  const { pathname } = useLocation();
  const title = getTitle(pathname);

  return (
    // Outer column: the dev-only banner sits above everything and flexbox gives it
    // its own height, so nothing below needs a hard-coded offset.
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Gated at the call site so rollup drops the component AND its label string
          from a production bundle (`import.meta.env.DEV` is statically false there). */}
      {import.meta.env.DEV && <EnvBanner />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title={title} />
          <main className="flex-1 overflow-auto">
            <ErrorBoundary>
              <div className="p-6 animate-fade-in">
                <Outlet />
              </div>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
