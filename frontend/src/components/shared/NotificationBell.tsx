import { Bell, CheckCheck, Inbox, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useUIStore } from '@/store';
import { formatDate } from '@/utils';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

const DOT: Record<Notification['type'], string> = {
  success: 'bg-profit',
  error: 'bg-loss',
  warning: 'bg-warning',
  info: 'bg-info',
};

/**
 * The bell used to be a `<Button>` with a badge and no handler at all — the app
 * stored notifications and had no way to read them. It is now a real popover:
 * unread first, each item time-stamped, with "mark all read" and "clear"
 * available and disabled when there is nothing to do.
 */
export function NotificationBell() {
  const notifications = useUIStore((s) => s.notifications);
  const markNotificationRead = useUIStore((s) => s.markNotificationRead);
  const markAllRead = useUIStore((s) => s.markAllRead);
  const clearNotifications = useUIStore((s) => s.clearNotifications);
  const unreadCount = useUIStore((s) => s.unreadCount());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications, none unread'
          }
        >
          <Bell aria-hidden="true" className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="loss"
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 h-5 min-w-5 justify-center px-1 text-xs tabular-nums"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
              Mark read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2"
              onClick={clearNotifications}
              disabled={notifications.length === 0}
              aria-label="Clear all notifications"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Inbox aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">You are all caught up</p>
            <p className="text-xs text-muted-foreground">
              Imports, deletes and backup restores are reported here.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => markNotificationRead(n.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-base ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[n.type], n.read && 'opacity-40')}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', n.read ? 'font-normal' : 'font-semibold')}>
                      {n.title}
                    </span>
                    {n.message && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{n.message}</span>
                    )}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatDate(n.createdAt, 'relative')}
                    </span>
                  </span>
                  {!n.read && <span className="sr-only">Unread</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
