import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { NavLink, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useMe } from '@/hooks';
import { Brand } from '@/components/shared';
import { navGroupsFor, isNavItemActive, navItemClass } from './nav';

interface MobileNavProps {
  /** Drawer visibility, owned by MainLayout so the Header can toggle it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The phone/tablet answer to the desktop sidebar: same destinations, in a left
 * slide-over. Built on Radix Dialog rather than a hand-rolled overlay so focus
 * trapping, Escape-to-close and the inert background come for free.
 *
 * Rendered `md:hidden` — from `md` up the real sidebar is on screen and two nav
 * surfaces must never be reachable at once.
 *
 * The drawer carries each destination's one-line description: the bottom bar has
 * room for labels only, so this is the one place the app can say what a section
 * actually contains before you tap it.
 */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const { pathname } = useLocation();
  const { data: user } = useMe();
  // Only decides whether the admin group is drawn; the server is what refuses it.
  const isAdmin = user?.role === 'admin';

  // Tapping a link must close the drawer: Radix keeps it mounted across a
  // client-side route change, so the new page would appear behind an open
  // overlay. Keyed on pathname, so it also fires for in-page redirects.
  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-overlay md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-3">
            <DialogPrimitive.Title className="flex items-center">
              <Brand />
            </DialogPrimitive.Title>
            {/* 44x44: the header's close affordances were the smallest targets in the app. */}
            <DialogPrimitive.Close
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-base ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close navigation"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto p-2" aria-label="Main navigation">
            {navGroupsFor(isAdmin).map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.items.map(({ label, icon: Icon, to, description }) => {
                    const isActive = isNavItemActive(pathname, to);
                    return (
                      <li key={to}>
                        {/* className is a plain string, not a function: see nav.ts. */}
                        <NavLink
                          to={to}
                          aria-current={isActive ? 'page' : undefined}
                          className={navItemClass(isActive, 'h-auto min-h-11 items-start py-2.5')}
                        >
                          <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">{label}</span>
                            <span className="truncate text-xs font-normal text-muted-foreground">
                              {description}
                            </span>
                          </span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
