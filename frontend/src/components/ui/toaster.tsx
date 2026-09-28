import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';
import { useUIStore } from '@/store';

/**
 * Renders the notifications the app has always been storing. Unread items
 * appear as toasts (newest first, capped so a burst cannot bury the screen);
 * dismissing one — by swipe, by the close button, or by the timer — marks it
 * read, which is also how the header's bell clears its badge.
 *
 * Mounted once, in the app shell.
 */
export function Toaster() {
  const notifications = useUIStore((s) => s.notifications);
  const markNotificationRead = useUIStore((s) => s.markNotificationRead);

  const visible = notifications.filter((n) => !n.read).slice(0, 3);

  return (
    <ToastProvider swipeDirection="right" duration={6000}>
      {visible.map((n) => (
        <Toast
          key={n.id}
          variant={n.type}
          onOpenChange={(open) => {
            if (!open) markNotificationRead(n.id);
          }}
        >
          <ToastTitle>{n.title}</ToastTitle>
          {n.message && <ToastDescription>{n.message}</ToastDescription>}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
