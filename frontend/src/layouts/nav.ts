import { LayoutDashboard, Briefcase, BarChart2, Settings } from 'lucide-react';
import { ROUTES } from '@/constants';

/**
 * The four top-level destinations. Shared by the desktop sidebar, the mobile
 * drawer and the mobile bottom bar so a route change is a one-line edit and the
 * three surfaces can never drift apart.
 */
export const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.DASHBOARD },
  { label: 'Portfolios', icon: Briefcase, to: ROUTES.PORTFOLIOS },
  { label: 'Market', icon: BarChart2, to: ROUTES.MARKET },
  { label: 'Settings', icon: Settings, to: ROUTES.SETTINGS },
] as const;

/**
 * Mirrors React Router's `NavLink` default matching (i.e. no `end` prop): an
 * item is active on its own path and on anything nested beneath it, so
 * Portfolios/Market stay highlighted while a detail page is open.
 *
 * Computed here rather than handed to `NavLink` as a function: inside a Radix
 * `TooltipTrigger asChild` the function form is `String()`-ified into the class
 * attribute and every utility in it is dropped.
 */
export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
