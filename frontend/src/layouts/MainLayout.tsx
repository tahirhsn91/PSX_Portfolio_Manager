import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBoundary } from '@/components/shared';
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
    <div className="flex h-screen overflow-hidden bg-background">
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
  );
}
