import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Crumb {
  label: string;
  /** Omitted for the current page, which is the last crumb. */
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Ancestors first, current page last. One crumb renders as plain text. */
  breadcrumbs?: Crumb[];
  /** Primary and secondary actions for the screen, in priority order. */
  actions?: ReactNode;
  /** Small status line under the title (market session, `as of` stamp). */
  meta?: ReactNode;
  className?: string;
}

/**
 * The one place a page states where you are and what you can do here. It exists
 * because every page had invented its own title treatment (text-2xl here,
 * text-xl sm:text-2xl there, text-6xl on the 404) and the detail pages repeated
 * their own name twice.
 */
export function PageHeader({ title, description, breadcrumbs, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {breadcrumbs.map((crumb, i) => (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight aria-hidden="true" className="h-3 w-3" />}
                  {crumb.to ? (
                    <Link
                      to={crumb.to}
                      className="rounded-sm underline-offset-4 transition-colors duration-base ease-standard hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-foreground">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {meta}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}
