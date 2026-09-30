import { Sun, Moon, Monitor, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Brand, NotificationBell } from '@/components/shared';
import { useTheme } from '@/hooks';
import { useMarketStatus } from '@/hooks';
import { cn } from '@/lib/utils';

interface HeaderProps {
  /** Opens the mobile navigation drawer. The trigger is hidden from `md` up. */
  onOpenNav: () => void;
}

const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

/**
 * The app bar. It carries the chrome only — market session, notifications,
 * theme — and deliberately does *not* repeat the page title: the header and the
 * page heading were stating the same words twice, one above the other.
 *
 * The market session chip is the header's one live element, so it is a
 * `role="status"` region: when PSX opens or closes, a screen reader is told
 * rather than having to go looking.
 */
export function Header({ onOpenNav }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { data: marketStatus } = useMarketStatus();

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const isOpen = marketStatus?.isOpen ?? false;
  // The exchange's own clock, not the viewer's: PSX closes at 15:30 PKT wherever
  // you happen to be reading this.
  const pktTime = (iso: string) =>
    new Intl.DateTimeFormat('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Karachi',
    }).format(new Date(iso));
  const nextEvent = marketStatus
    ? isOpen
      ? marketStatus.nextClose
        ? `closes ${pktTime(marketStatus.nextClose)} PKT`
        : null
      : marketStatus.nextOpen
        ? `opens ${pktTime(marketStatus.nextOpen)} PKT`
        : null
    : null;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* Phones and small tablets only — from `md` the sidebar is on screen. */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </Button>
        {/* The bar's own identity on mobile, where the sidebar is not on screen. */}
        <Brand size="sm" className="md:hidden" />

        {marketStatus && (
          <div
            role="status"
            className="hidden items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-xs font-medium md:inline-flex"
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                // `motion-safe:` — a pulsing dot is exactly the kind of ambient
                // animation `prefers-reduced-motion` exists to switch off.
                isOpen ? 'bg-profit motion-safe:animate-pulse' : 'bg-muted-foreground'
              )}
            />
            <span>
              PSX {isOpen ? 'open' : 'closed'}
              {nextEvent && ` · ${nextEvent}`}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Below `md` the chip collapses to a dot so the bar does not crowd. */}
        {marketStatus && (
          <span role="status" className="flex items-center gap-2 px-2 md:hidden">
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                isOpen ? 'bg-profit motion-safe:animate-pulse' : 'bg-muted-foreground'
              )}
            />
            <span className="sr-only">PSX market is {isOpen ? 'open' : 'closed'}</span>
          </span>
        )}

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Theme: ${THEME_LABEL[theme]}. Change theme`}>
              <ThemeIcon aria-hidden="true" className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme('light')}>
              <Sun aria-hidden="true" className="mr-2 h-4 w-4" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('dark')}>
              <Moon aria-hidden="true" className="mr-2 h-4 w-4" /> Dark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme('system')}>
              <Monitor aria-hidden="true" className="mr-2 h-4 w-4" /> System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
