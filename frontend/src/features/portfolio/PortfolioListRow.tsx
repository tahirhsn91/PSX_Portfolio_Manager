import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { PLValue } from '@/components/shared';
import { formatCurrency } from '@/utils';
import { ROUTES } from '@/constants';
import type { Portfolio, PortfolioMetrics } from '@/types';
import { cn } from '@/lib/utils';
import { moneyInk } from './PortfolioCard';
import { PortfolioActionsMenu } from './PortfolioActionsMenu';

interface PortfolioListRowProps {
  portfolio: Portfolio;
  metrics: PortfolioMetrics | null;
  isLoading?: boolean;
  onEdit: (portfolio: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}

/**
 * One portfolio as a compact row for the list view.
 *
 * The grid card is ~220px tall; on a phone the grid is a single column, so
 * rendering the same card for "list" made the switch a no-op — both views were
 * pixel-identical. The row keeps the same figures (value, total return, today's
 * move, holdings) at roughly a third of the height, which is what the list view
 * is for. The link and the actions stay siblings, as in the card.
 */
export function PortfolioListRow({
  portfolio, metrics, isLoading, onEdit, onDelete, onDuplicate, onArchive, onRestore,
}: PortfolioListRowProps) {
  const holdingCount = portfolio.holdings.length;

  return (
    <li className="group flex items-stretch transition-colors duration-base ease-standard hover:bg-muted/40 focus-within:bg-muted/40">
      <Link
        to={ROUTES.PORTFOLIO_DETAIL_PATH(portfolio.id)}
        className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Open ${portfolio.name}`}
      >
        <span
          aria-hidden="true"
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: portfolio.color }}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold transition-colors duration-base ease-standard group-hover:text-primary">
            {portfolio.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {holdingCount} holding{holdingCount !== 1 ? 's' : ''} · Invested{' '}
            <span className="tabular-nums">{formatCurrency(metrics?.totalInvestment ?? 0, true)}</span>
          </p>
          {isLoading ? (
            <Skeleton className="mt-1.5 h-3 w-28" />
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Today</span>
              {/* The rupee amount is the first thing to go on a 320px screen; the
                  percentage alone still answers "how did today go?". */}
              <span className={cn('hidden tabular-nums min-[360px]:inline', moneyInk(metrics?.todayPL ?? 0))}>
                {formatCurrency(metrics?.todayPL ?? 0)}
              </span>
              <PLValue value={metrics?.todayPLPercent ?? 0} showIcon={false} />
            </p>
          )}
        </div>

        <div className="shrink-0 pr-1 text-right">
          {isLoading ? (
            <div className="space-y-2 pt-0.5" aria-busy="true">
              <Skeleton className="ml-auto h-4 w-20" />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(metrics?.currentValue ?? 0, true)}
              </p>
              <div className="mt-0.5 flex justify-end">
                <PLValue value={metrics?.totalPLPercent ?? 0} />
              </div>
              <p className="mt-0.5 hidden text-[11px] leading-tight text-muted-foreground sm:block">total return</p>
            </>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 items-start py-2 pr-1">
        <PortfolioActionsMenu
          portfolio={portfolio}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onRestore={onRestore}
        />
      </div>
    </li>
  );
}
