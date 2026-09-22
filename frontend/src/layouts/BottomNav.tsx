import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, isNavItemActive } from './nav';

/**
 * Thumb-reachable primary navigation for phones and small tablets.
 *
 * A flex sibling under `<main>` rather than a `fixed` bar, so it can never
 * cover the last row of content and needs no scroll padding hack. Bottom
 * padding carries `env(safe-area-inset-bottom)`, which is 0 everywhere except
 * notched/home-indicator devices.
 *
 * `md:hidden`: from `md` up the sidebar owns navigation.
 */
export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="shrink-0 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map(({ label, icon: Icon, to }) => {
          const isActive = isNavItemActive(pathname, to);
          return (
            <li key={to}>
              {/* h-14 (56px) clears the 44x44 touch-target floor with room for a label. */}
              <NavLink
                to={to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
