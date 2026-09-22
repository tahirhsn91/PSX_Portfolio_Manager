import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, isNavItemActive } from './nav';

interface MobileNavProps {
  /** Drawer visibility, owned by MainLayout so the Header can toggle it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The phone/tablet answer to the desktop sidebar: same four destinations, in a
 * left slide-over. Built on Radix Dialog rather than a hand-rolled overlay so
 * focus trapping, Escape-to-close and the inert background come for free.
 *
 * Rendered `md:hidden` — from `md` up the real sidebar is on screen and two
 * nav surfaces must never be reachable at once.
 */
export function MobileNav({ open, onOpenChange }: MobileNavProps) {
  const { pathname } = useLocation();

  // Tapping a link must close the drawer: Radix keeps it mounted across a
  // client-side route change, so the new page would appear behind an open
  // overlay. Keyed on pathname, so it also fires for in-page redirects.
  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-lg md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
            <DialogPrimitive.Title className="flex items-center gap-3 text-base font-semibold">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                <Activity className="h-5 w-5 text-primary-foreground" />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-bold">PSX Portfolio</span>
                <span className="text-xs font-normal text-muted-foreground">Manager</span>
              </span>
            </DialogPrimitive.Title>
            {/* 44x44: the header's close affordances were the smallest targets in the app. */}
            <DialogPrimitive.Close
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <nav className="flex-1 overflow-y-auto p-2" aria-label="Main navigation">
            <ul className="space-y-1">
              {NAV_ITEMS.map(({ label, icon: Icon, to }) => {
                const isActive = isNavItemActive(pathname, to);
                return (
                  <li key={to}>
                    {/* className is a plain string, not a function: see nav.ts. */}
                    <NavLink
                      to={to}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
