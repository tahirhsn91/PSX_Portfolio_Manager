import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NAV_ITEMS, bottomNavItemClass, isNavItemActive } from './nav';

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
      {/* Five primary destinations, five columns — the bottom bar caps at five
          (the ui-ux-pro "≤5" rule). Profile stays in the sidebar/drawer so nothing
          wraps onto a second row. */}
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.filter((item) => !item.adminOnly && item.inBottomNav !== false).map(({ label, icon: Icon, to }) => {
          const isActive = isNavItemActive(pathname, to);
          return (
            <li key={to} className="min-w-0">
              {/* h-14 (56px) clears the 44x44 touch-target floor with room for a label. */}
              <NavLink to={to} aria-current={isActive ? 'page' : undefined} className={bottomNavItemClass(isActive)}>
                {/* The active wash slides between items instead of popping. Rendered
                    first so the icon and label paint above it. */}
                {isActive && (
                  <motion.span
                    layoutId="bottomnav-active-wash"
                    aria-hidden="true"
                    className="absolute inset-x-2 inset-y-1 rounded-md bg-primary/10"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon aria-hidden="true" className="relative h-5 w-5" />
                {/* text-xs, not text-[11px]: it is the only label on the control. */}
                <span className="relative max-w-full truncate">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
