import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Briefcase, BarChart2, TrendingUp,
  Settings, ChevronLeft, ChevronRight, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import { ROUTES } from '@/constants';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.DASHBOARD },
  { label: 'Portfolios', icon: Briefcase, to: ROUTES.PORTFOLIOS },
  { label: 'Market', icon: BarChart2, to: ROUTES.MARKET },
  { label: 'Settings', icon: Settings, to: ROUTES.SETTINGS },
] as const;

export function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-300 ease-in-out',
        isSidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4 gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Activity className="h-5 w-5 text-primary-foreground" />
        </div>
        {!isSidebarCollapsed && (
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-sm">PSX Portfolio</span>
            <span className="text-xs text-muted-foreground">Manager</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <TooltipProvider delayDuration={0}>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(({ label, icon: Icon, to }) => (
            <Tooltip key={to} disableHoverableContent={!isSidebarCollapsed}>
              <TooltipTrigger asChild>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      isSidebarCollapsed && 'justify-center px-2'
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isSidebarCollapsed && <span>{label}</span>}
                </NavLink>
              </TooltipTrigger>
              {isSidebarCollapsed && (
                <TooltipContent side="right">{label}</TooltipContent>
              )}
            </Tooltip>
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
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
