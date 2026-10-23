/**
 * Application route constants.
 * Centralize here so refactoring one route updates all references.
 */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  PORTFOLIOS: '/portfolios',
  DIVIDENDS: '/dividends',
  PORTFOLIO_DETAIL: '/portfolios/:id',
  PORTFOLIO_DETAIL_PATH: (id: string) => `/portfolios/${id}`,
  STOCK_DETAIL: '/portfolios/:portfolioId/stocks/:symbol',
  STOCK_DETAIL_PATH: (portfolioId: string, symbol: string) =>
    `/portfolios/${portfolioId}/stocks/${symbol}`,
  WATCHLIST: '/watchlist',
  PLANNER: '/planner',
  PLANNER_PATH: (opts?: { portfolio?: string; symbol?: string }) => {
    const search = new URLSearchParams();
    if (opts?.portfolio) search.set('portfolio', opts.portfolio);
    if (opts?.symbol) search.set('symbol', opts.symbol);
    const query = search.toString();
    return query ? `/planner?${query}` : '/planner';
  },
  ALERTS: '/alerts',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  ADMIN_USERS: '/admin/users',
  LOGIN: '/login',
  SIGNUP: '/signup',
  NOT_FOUND: '*',
} as const;
