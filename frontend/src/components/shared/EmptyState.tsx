import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * The empty state is where the user decides what to do next, so it carries a
 * real action and explains the situation rather than just reporting it. The
 * icon is decorative and hidden from assistive tech.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-surface/50 p-10 text-center',
        className
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
