import { AlertCircle } from 'lucide-react';

/**
 * One place for "that didn't work", used by every auth form.
 *
 * `role="alert"` so a screen reader announces it without the user hunting for
 * what changed, and the icon carries a shape as well as a colour — the message is
 * never signalled by red alone.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
