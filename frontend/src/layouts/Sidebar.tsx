import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { NAV_GROUPS, isNavItemActive, navItemClass } from './nav';

/**
 * Desktop navigation. The items are grouped (workspace vs configuration) instead
 * of being one flat list, and each group is labelled — with four destinations the
 * flat list was fine, but the labels cost nothing and the structure is what makes
 * a fifth one obvious to place.
 */
export function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();
  const { pathname } = useLocation();

  return (
    <aside
      className={cn(
        // Hidden below `md` — the drawer and bottom bar own phone navigation.
        'hidden shrink-0 flex-col border-r bg-card md:flex',
        // Width only: `transition-all` also animated borders and padding on every
        // hover in the subtree.
        'transition-[width] duration-base ease-standard motion-reduce:transition-none',
        isSidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b px-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <LineChart className="h-5 w-5" />
        </div>
        {!isSidebarCollapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">PSX Portfolio</span>
            <span className="truncate text-xs text-muted-foreground">Manager</span>
          </div>
        )}
      </div>

      {/* Destinations */}
      <TooltipProvider delayDuration={0}>
        <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto p-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!isSidebarCollapsed && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map(({ label, icon: Icon, to }) => {
                  const isActive = isNavItemActive(pathname, to);
                  return (
                    <li key={to}>
                      <Tooltip disableHoverableContent={!isSidebarCollapsed}>
                        <TooltipTrigger asChild>
                          {/* className must stay a plain string: `asChild` renders through
                              Radix `Slot`, which merges props by string-joining
                              `className` — the function form gets String()-ified into
                              the class attribute and every utility is dropped. */}
                          <NavLink
                            to={to}
                            aria-current={isActive ? 'page' : undefined}
                            className={navItemClass(isActive, isSidebarCollapsed ? 'justify-center px-2' : '')}
                          >
                            <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
                            {!isSidebarCollapsed && <span className="truncate">{label}</span>}
                          </NavLink>
                        </TooltipTrigger>
                        {isSidebarCollapsed && <TooltipContent side="right">{label}</TooltipContent>}
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </TooltipProvider>

      {/* Collapse toggle */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isSidebarCollapsed}
        >
          {isSidebarCollapsed ? (
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
