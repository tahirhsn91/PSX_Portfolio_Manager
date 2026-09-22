import { Sun, Moon, Monitor, Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks';
import { useUIStore } from '@/store';
import { useMarketStatus } from '@/hooks';

interface HeaderProps {
  title: string;
  /** Opens the mobile navigation drawer. The trigger is hidden from `md` up. */
  onOpenNav: () => void;
}

export function Header({ title, onOpenNav }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const unreadCount = useUIStore((s) => s.unreadCount());
  const { data: marketStatus } = useMarketStatus();

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Phones and small tablets only — from `md` the sidebar is on screen. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 md:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {/* min-w-0 + truncate: "Portfolio Details" and long titles otherwise push the
            action buttons off a 360px screen. */}
        <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Market status */}
        {marketStatus && (
          <div className="hidden sm:flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${marketStatus.isOpen ? 'bg-profit animate-pulse' : 'bg-muted-foreground'}`} />
            <span className="text-xs text-muted-foreground">
              PSX {marketStatus.isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
        )}

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-11 w-11">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>

        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11">
              <ThemeIcon className="h-5 w-5" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun className="mr-2 h-4 w-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon className="mr-2 h-4 w-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor className="mr-2 h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
