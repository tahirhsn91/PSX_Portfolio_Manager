/**
 * Application route constants.
 * Centralize here so refactoring one route updates all references.
 */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  PORTFOLIOS: '/portfolios',
  PORTFOLIO_DETAIL: '/portfolios/:id',
  PORTFOLIO_DETAIL_PATH: (id: string) => `/portfolios/${id}`,
  STOCK_DETAIL: '/portfolios/:portfolioId/stocks/:symbol',
  STOCK_DETAIL_PATH: (portfolioId: string, symbol: string) =>
    `/portfolios/${portfolioId}/stocks/${symbol}`,
  WATCHLIST: '/watchlist',
  ALERTS: '/alerts',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  ADMIN_USERS: '/admin/users',
  LOGIN: '/login',
  SIGNUP: '/signup',
  NOT_FOUND: '*',
} as const;
