import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Briefcase, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PLValue } from '@/components/shared';
import { formatCurrency, formatDate } from '@/utils';
import type { Holding, HoldingMetrics } from '@/types';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants';

interface HoldingsTableProps {
  holdings: Holding[];
  metrics: HoldingMetrics[];
  portfolioId: string;
  isLoading?: boolean;
  onEdit: (holding: Holding) => void;
  onDelete: (holdingId: string) => void;
  /** Optional: when given, the empty state offers a way to add the first holding. */
  onAddHolding?: () => void;
  /** Class name for the empty / loading wrapper. */
  className?: string;
}

type SortKey = 'symbol' | 'currentValue' | 'unrealizedPLPercent' | 'todayChangePercent' | 'weightInPortfolio';

/** The sortable columns, for the phone layout's sort control. */
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'currentValue', label: 'Value' },
  { value: 'unrealizedPLPercent', label: 'Return' },
  { value: 'todayChangePercent', label: 'Today' },
  { value: 'weightInPortfolio', label: 'Weight' },
  { value: 'symbol', label: 'Symbol' },
];

/** How many placeholder rows stand in for the table while the quotes load. */
const SKELETON_ROWS = 5;

/**
 * Shown on a holding the feed cannot price. It replaces every price-derived figure
 * on the row: a 404 used to arrive as a zero quote and read as "worth nothing, down
 * 100%", which is indistinguishable from a real loss.
 */
function UnavailableChip() {
  return (
    <span className="mt-1 inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
      price unavailable
    </span>
  );
}

/** A label/value pair inside a phone card. */
function Stat({ label, children, money }: { label: string; children: ReactNode; money?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono', money && 'tabular-nums')}>{children}</dd>
    </div>
  );
}

/**
 * A sortable column head: a real `<button>` inside the `<th>`, carrying the
 * column's name as its label and the current direction as its icon, with
 * `aria-sort` on the header cell so a screen reader announces the state of the
 * column rather than an unlabelled icon it has to guess at.
 *
 * The button spans the whole header cell, so the target is 44px tall — the
 * previous icon-only 20px nub was neither named nor reachable.
 */
function SortHeader({
  col, label, sortKey, sortDir, onSort, align = 'right',
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === col;
  const ariaSort: 'ascending' | 'descending' | 'none' = active
    ? sortDir === 'asc' ? 'ascending' : 'descending'
    : 'none';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn('px-2 py-0 font-medium', align === 'left' ? 'text-left' : 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex min-h-11 w-full items-center gap-1 whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors duration-base ease-standard',
          'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          align === 'left' ? 'justify-start' : 'justify-end',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        {active ? (
          sortDir === 'asc'
            ? <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
            : <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>
    </th>
  );
}

export function HoldingsTable({
  holdings, metrics, portfolioId, isLoading, onEdit, onDelete, onAddHolding, className,
}: HoldingsTableProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('currentValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...holdings].sort((a, b) => {
    const ma = metrics.find((m) => m.holdingId === a.id);
    const mb = metrics.find((m) => m.holdingId === b.id);
    let va = 0, vb = 0;
    if (sortKey === 'symbol') return sortDir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
    if (ma && mb) {
      va = ma[sortKey];
      vb = mb[sortKey];
    }
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  /* The row actions, sized for the surface they sit on. Both are 44x44 and are
     rendered unconditionally: a control that only appears on hover does not
     exist on a touch screen. */
  const actions = (holding: Holding) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        aria-label={`Edit ${holding.symbol}`}
        onClick={() => onEdit(holding)}
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label={`Delete ${holding.symbol}`}
        onClick={() => onDelete(holding.id)}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );

  /*
   * Nothing to show and nothing loading: the table explains how to fill itself
   * rather than rendering a header over an empty body.
   */
  if (!isLoading && holdings.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<Briefcase className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        title="No holdings in this portfolio"
        description="Search a PSX ticker, then set how many shares you own and what you paid. The holding's live value, return and today's move appear here as soon as it is added."
        action={onAddHolding ? (
          <Button onClick={onAddHolding}>
            <Plus aria-hidden="true" /> Add your first holding
          </Button>
        ) : undefined}
      />
    );
  }

  return (
    <>
      {/* Loading is announced once for the region that owns it. */}
      <p role="status" className="sr-only">
        {isLoading
          ? 'Loading holdings…'
          : `${sorted.length} holding${sorted.length !== 1 ? 's' : ''} shown`}
      </p>

      {/* Phones: a ten-column table needs ~990px, so below md the same rows
          render as cards instead. Same data, same sort state, same 44px actions. */}
      <div className={cn('space-y-3 md:hidden', className)} aria-busy={isLoading || undefined}>
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
            <SelectTrigger className="h-11 flex-1" aria-label="Sort holdings by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>Sort by {o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label={sortDir === 'desc' ? 'Sort descending' : 'Sort ascending'}
            className="h-11 w-11 shrink-0"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          >
            {sortDir === 'desc' ? <ArrowDown aria-hidden="true" className="h-4 w-4" /> : <ArrowUp aria-hidden="true" className="h-4 w-4" />}
          </Button>
        </div>

        {isLoading ? (
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
                <Skeleton className="h-16 w-full" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3">
            {sorted.map((holding) => {
              const m = metrics.find((x) => x.holdingId === holding.id);
              // Nothing price-derived is rendered for an unpriced holding: no Rs 0.00,
              // no fabricated return. Cost and the purchase date are still facts.
              const priced = !!m?.priceAvailable;
              return (
                <li
                  key={holding.id}
                  className="cursor-pointer rounded-lg border bg-card p-4 active:bg-muted/30"
                  onClick={() => navigate(ROUTES.STOCK_DETAIL_PATH(portfolioId, holding.symbol))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={ROUTES.STOCK_DETAIL_PATH(portfolioId, holding.symbol)}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex min-h-11 min-w-11 items-center font-mono font-bold text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {holding.symbol}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{holding.companyName}</div>
                      {!priced && <UnavailableChip />}
                    </div>
                    <div className="shrink-0 text-right">
                      {priced && m ? (
                        <>
                          <div className="font-mono font-medium tabular-nums">{formatCurrency(m.currentValue)}</div>
                          <div className="mt-1"><PLValue value={m.unrealizedPLPercent} className="tabular-nums" /></div>
                        </>
                      ) : (
                        <div className="font-mono text-muted-foreground">—</div>
                      )}
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs">
                    <Stat label="Shares" money>{holding.shares.toLocaleString()}</Stat>
                    <Stat label="Avg cost" money>{formatCurrency(holding.averagePurchasePrice)}</Stat>
                    <Stat label="Price" money>{priced && m ? formatCurrency(m.currentPrice) : '—'}</Stat>
                    <Stat label="Weight" money>{priced && m ? `${m.weightInPortfolio.toFixed(1)}%` : '—'}</Stat>
                    <Stat label="Today">
                      {priced && m ? <PLValue value={m.todayChangePercent} showIcon={false} className="tabular-nums" /> : '—'}
                    </Stat>
                    <Stat label="Bought">{formatDate(holding.purchaseDate)}</Stat>
                  </dl>

                  {/* The row is a mouse shortcut; the symbol link is the keyboard
                      path to the same page, and the actions stop the click. */}
                  <div className="mt-3 flex justify-end gap-2 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                    {actions(holding)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* md and up keep the table, inside its own scroll container: when the
          viewport (or the sidebar) leaves no room for ten columns the table
          scrolls sideways *within this box*, and the page itself never does.
          `contain-paint` is load-bearing, not decoration: without it Chromium
          still adds the table's overflowing width to the *document's* scrollable
          area, so the page grows a 26px horizontal scrollbar of its own even
          though this box is the one doing the scrolling. Measured at 1280px:
          without the class the document scrolls 26px; with it, 0. */}
      <div
        className={cn(
          'hidden max-w-full overflow-x-auto overscroll-x-contain contain-paint rounded-lg border md:block',
          className,
        )}
        role="region"
        aria-label="Holdings"
        aria-busy={isLoading || undefined}
        tabIndex={0}
      >
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <SortHeader col="symbol" label="Symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <th scope="col" className="px-3 py-3 text-right font-medium">Shares</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Avg cost</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Price</th>
              <SortHeader col="currentValue" label="Value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader col="todayChangePercent" label="Today" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader col="unrealizedPLPercent" label="Return" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader col="weightInPortfolio" label="Weight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th scope="col" className="px-3 py-3 text-left font-medium">Bought</th>
              {/* Pinned to the right edge of the scroll box: the row actions
                  stay on screen even when the ten columns need the wrapper to
                  scroll sideways, so they never need a sideways drag first. */}
              <th
                scope="col"
                className="sticky right-0 z-10 w-[104px] border-l border-border bg-muted px-3 py-3"
              >
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="mt-2 h-3 w-28" />
                    </td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-14" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="ml-auto h-4 w-12" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="sticky right-0 z-10 w-[104px] border-l border-border bg-card px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Skeleton className="h-11 w-11" />
                        <Skeleton className="h-11 w-11" />
                      </div>
                    </td>
                  </tr>
                ))
              : sorted.map((holding) => {
                  const m = metrics.find((x) => x.holdingId === holding.id);
                  const priced = !!m?.priceAvailable;
                  return (
                    <tr
                      key={holding.id}
                      className="group border-b transition-colors hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(ROUTES.STOCK_DETAIL_PATH(portfolioId, holding.symbol))}
                    >
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <Link
                            to={ROUTES.STOCK_DETAIL_PATH(portfolioId, holding.symbol)}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex min-h-11 min-w-11 w-fit items-center rounded-sm font-mono font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            {holding.symbol}
                          </Link>
                          <span className="max-w-[132px] truncate text-xs text-muted-foreground">{holding.companyName}</span>
                          {!priced && <UnavailableChip />}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{holding.shares.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(holding.averagePurchasePrice)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{priced && m ? formatCurrency(m.currentPrice) : '—'}</td>
                      <td className="px-3 py-3 text-right font-mono font-medium tabular-nums">{priced && m ? formatCurrency(m.currentValue) : '—'}</td>
                      <td className="px-3 py-3 text-right">
                        {priced && m && (
                          <PLValue value={m.todayChangePercent} showIcon={false} className="tabular-nums" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {priced && m ? <PLValue value={m.unrealizedPLPercent} className="tabular-nums" /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                        {priced && m ? `${m.weightInPortfolio.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDate(holding.purchaseDate)}
                      </td>
                      <td className="sticky right-0 z-10 w-[104px] border-l border-border bg-card px-3 py-3 transition-colors group-hover:bg-muted/30">
                        {/* Clicks on the actions must not also open the stock's page. */}
                        <div onClick={(e) => e.stopPropagation()}>
                          {actions(holding)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </>
  );
}
