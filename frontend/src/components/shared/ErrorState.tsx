import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  /** What went wrong, in the user's terms. */
  title?: string;
  description?: string;
  /** The underlying message, shown as supporting detail when it adds anything. */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * The app had no error state at all outside one caption on the market page, so
 * a failed fetch and an empty portfolio looked identical. This is that missing
 * state: what failed, what it means for the numbers below, and one way out.
 *
 * `role="alert"` so a failure is announced when it replaces content the user
 * was reading.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'The data could not be loaded. Your saved portfolio is unaffected.',
  detail,
  onRetry,
  retryLabel = 'Try again',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-loss/30 bg-loss-light/60 p-8 text-center',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-loss-light text-loss-dark"
      >
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-base font-semibold text-loss-dark">{title}</h3>
        <p className="text-sm text-loss-dark/90">{description}</p>
        {detail && <p className="pt-1 text-xs text-loss-dark/80">{detail}</p>}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            {retryLabel}
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}
