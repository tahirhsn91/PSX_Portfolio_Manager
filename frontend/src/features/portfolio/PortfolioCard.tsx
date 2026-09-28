import { Link } from 'react-router-dom';
import { MoreVertical, Copy, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PLValue } from '@/components/shared';
import { formatCurrency } from '@/utils';
import { ROUTES } from '@/constants';
import type { Portfolio, PortfolioMetrics } from '@/types';
import { cn } from '@/lib/utils';

interface PortfolioCardProps {
  portfolio: Portfolio;
  metrics: PortfolioMetrics | null;
  isLoading?: boolean;
  onEdit: (portfolio: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

/**
 * The ink pair the shared `PLValue` uses, for the rupee figure that sits next
 * to it. `PLValue` renders a percentage only, so the amount beside it has to
 * borrow the same theme-aware tone rather than re-inventing a colour.
 */
const moneyInk = (value: number) =>
  value >= 0 ? 'text-profit-dark dark:text-profit' : 'text-loss-dark dark:text-loss';

/**
 * One portfolio, as a single link with its row actions beside it.
 *
 * It used to be a clickable `<div>` with a dropdown *inside* it: two nested
 * interactive regions, a `stopPropagation` on every one of them, and no way to
 * reach the card from the keyboard at all. Now the whole tile is one `<a>` with
 * one focus ring, and the actions live in a sibling — so tabbing reaches the
 * link, then the actions, and the trigger is a full 44px target that is always
 * visible (there is no hover on a touch screen, and a control that only appears
 * on hover is a control half the users never see).
 */
export function PortfolioCard({
  portfolio, metrics, isLoading, onEdit, onDelete, onDuplicate,
}: PortfolioCardProps) {
  const holdingCount = portfolio.holdings.length;

  return (
    <Card
      className={cn(
        'group relative flex flex-col animate-fade-in',
        'transition-[box-shadow,transform] duration-base ease-standard hover:shadow-raised',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
      )}
    >
      <Link
        to={ROUTES.PORTFOLIO_DETAIL_PATH(portfolio.id)}
        className="flex flex-1 flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open ${portfolio.name}`}
      >
        {/* pr-16 keeps the title clear of the 44px actions button that sits over
            the top-right corner of the tile. */}
        <CardHeader className="pb-3 pr-16">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: portfolio.color }}
            />
            <div className="min-w-0">
              <CardTitle className="truncate transition-colors duration-base ease-standard group-hover:text-primary">
                {portfolio.name}
              </CardTitle>
              {portfolio.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{portfolio.description}</p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            // The tile keeps its shape while the quotes load, so the grid does
            // not reflow when they land.
            <div className="space-y-3" aria-busy="true">
              <div className="space-y-2">
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <div>
                {/* tabular-nums: a column of figures has to line up. Money is
                    never tinted here — the tile's surface stays neutral, so a
                    losing portfolio does not read as a broken one. */}
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {formatCurrency(metrics?.currentValue ?? 0, true)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Invested{' '}
                  <span className="tabular-nums">
                    {formatCurrency(metrics?.totalInvestment ?? 0, true)}
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-baseline gap-1.5">
                  <PLValue value={metrics?.totalPLPercent ?? 0} className="text-sm" />
                  <span className="text-xs text-muted-foreground">total return</span>
                </span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {holdingCount} holding{holdingCount !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Today's move on a neutral inset strip: the tone belongs to the
                  figure, not to the surface behind it. */}
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Today</span>
                <span className="flex items-baseline gap-1.5">
                  <span className={cn('text-xs font-medium tabular-nums', moneyInk(metrics?.todayPL ?? 0))}>
                    {formatCurrency(metrics?.todayPL ?? 0)}
                  </span>
                  <PLValue value={metrics?.todayPLPercent ?? 0} showIcon={false} className="tabular-nums" />
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Link>

      {/* A sibling of the link, never a child of it: no nested interactive, no
          stopPropagation. Every item is 44px tall and the trigger is always
          visible, so the actions are reachable by mouse, touch and keyboard. */}
      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${portfolio.name}`}>
              <MoreVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="h-11" onClick={() => onEdit(portfolio)}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="h-11" onClick={() => onDuplicate(portfolio.id)}>
              <Copy aria-hidden="true" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="h-11 text-destructive focus:text-destructive"
              onClick={() => onDelete(portfolio.id)}
            >
              <Trash2 aria-hidden="true" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
