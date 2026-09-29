import {
  LayoutDashboard,
  Briefcase,
  BarChart2,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** The one-line answer to "what is behind this link", used by the drawer. */
  description: string;
  group: 'Workspace' | 'Configuration' | 'Administration';
  /** Destinations only an admin may see. The server gates them regardless. */
  adminOnly?: boolean;
}

/**
 * The top-level destinations. Shared by the desktop sidebar, the mobile drawer and
 * the mobile bottom bar so a route change is a one-line edit and the three surfaces
 * can never drift apart.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    to: ROUTES.DASHBOARD,
    description: 'Value, profit and loss, and what moved',
    group: 'Workspace',
  },
  {
    label: 'Portfolios',
    icon: Briefcase,
    to: ROUTES.PORTFOLIOS,
    description: 'Every portfolio you track',
    group: 'Workspace',
  },
  {
    label: 'Market',
    icon: BarChart2,
    to: ROUTES.MARKET,
    description: 'Prices, movers and sectors',
    group: 'Workspace',
  },
  {
    label: 'Settings',
    icon: Settings,
    to: ROUTES.SETTINGS,
    description: 'Appearance, refresh and backup',
    group: 'Configuration',
  },
  {
    label: 'Profile',
    icon: UserRound,
    to: ROUTES.PROFILE,
    description: 'Your account and password',
    group: 'Configuration',
  },
  {
    label: 'Users',
    icon: Users,
    to: ROUTES.ADMIN_USERS,
    description: 'Accounts: create, suspend, change roles',
    group: 'Administration',
    adminOnly: true,
  },
];

/** Sidebar groupings; the order here is the order on screen. */
const NAV_GROUP_ORDER: readonly NavItem['group'][] = ['Workspace', 'Configuration', 'Administration'];

/**
 * The groupings an account may see. Hiding a destination is a convenience, not a
 * permission — the server refuses an admin route to a non-admin whatever the nav
 * shows — but showing an admin a door that is bolted to them is still wrong.
 */
export function navGroupsFor(isAdmin: boolean): { label: NavItem['group']; items: NavItem[] }[] {
  const visible = NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly);
  return NAV_GROUP_ORDER.map((label) => ({
    label,
    items: visible.filter((item) => item.group === label),
  })).filter((group) => group.items.length > 0);
}

/** Kept for the bottom bar, which shows a flat list and never an admin destination. */
export const NAV_GROUPS: readonly { label: NavItem['group']; items: readonly NavItem[] }[] = [
  { label: 'Workspace', items: NAV_ITEMS.filter((i) => i.group === 'Workspace') },
  { label: 'Configuration', items: NAV_ITEMS.filter((i) => i.group === 'Configuration') },
];

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

/**
 * One active treatment for the sidebar and the drawer: a soft action-coloured
 * fill, action-coloured ink, and a short rule down the leading edge so the
 * current section is findable at a glance in a dense list.
 *
 * It used to be a solid `bg-primary` block, which is why the app's loudest
 * colour appeared in the chrome three times over instead of on the one button
 * that acts.
 */
const NAV_ITEM_BASE =
  'relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';

const NAV_ITEM_ACTIVE =
  "bg-primary/10 text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']";

export function navItemClass(isActive: boolean, extra?: string): string {
  return cn(
    NAV_ITEM_BASE,
    isActive ? NAV_ITEM_ACTIVE : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    extra
  );
}

/**
 * The bottom bar's item: icon over label, with the active rule across the top so
 * the current destination is marked without relying on colour alone.
 */
export function bottomNavItemClass(isActive: boolean): string {
  return cn(
    'relative flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
    isActive
      ? "text-primary before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:rounded-full before:bg-primary before:content-['']"
      : 'text-muted-foreground hover:text-foreground'
  );
}
