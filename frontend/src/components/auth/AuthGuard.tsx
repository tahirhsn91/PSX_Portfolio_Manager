import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMe } from '@/hooks';
import { usePortfolioStore } from '@/store';
import { ROUTES } from '@/constants';

/**
 * Everything behind the sign-in wall.
 *
 * While the account is being read, render nothing rather than the sign-in page:
 * a redirect that fires before `/me` answers would bounce a signed-in user out on
 * every cold load. Once it answers, three outcomes are possible — no account
 * (→ sign in, remembering where they were headed), an account that still owes a
 * password change (→ the profile page, and nowhere else), or a normal session.
 */
export function AuthGuard() {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  const loadPortfolios = usePortfolioStore((s) => s.load);
  const resetPortfolios = usePortfolioStore((s) => s.reset);

  /**
   * Portfolios live on the server now, so they are fetched once the session is known
   * — and dropped on the way out, so the next account can never see the last one's
   * rows. Nothing is fetched while the session is still unknown: that would be a
   * request made as nobody.
   */
  useEffect(() => {
    if (isPending) return;
    if (user) void loadPortfolios();
    else resetPortfolios();
  }, [user, isPending, loadPortfolios, resetPortfolios]);

  if (isPending) {
    // A real <main> and a heading: this screen replaces the whole shell while the
    // session is read, and without them the document had no landmark and no h1.
    // `role="status"` lives on the inner node, not on <main>, or it would replace
    // the landmark role instead of adding to it.
    return (
      <main className="flex h-dvh items-center justify-center bg-background">
        <h1 className="sr-only">Loading your account</h1>
        <div role="status" aria-live="polite" className="flex items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <span className="sr-only">Checking your session…</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={ROUTES.LOGIN}
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }

  // A password somebody else chose gets you here and no further.
  if (user.mustChangePassword && location.pathname !== ROUTES.PROFILE) {
    return <Navigate to={ROUTES.PROFILE} replace />;
  }

  return <Outlet />;
}
