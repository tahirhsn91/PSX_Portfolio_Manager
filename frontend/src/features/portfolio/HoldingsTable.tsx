import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PLBadge } from '@/components/shared';
import { formatCurrency, formatPercent, formatDate } from '@/utils';
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

/**
 * Shown on a holding the feed cannot price. It replaces every price-derived figure
 * on the row: a 404 used to arrive as a zero quote and read as "worth nothing, down
 * 100%", which is indistinguishable from a real loss.
 */
function UnavailableChip() {
  return (
    <span className="mt-1 inline-flex w-fit items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      price unavailable
    </span>
  );
}

/** A label/value pair inside a phone card. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}

export function HoldingsTable({
  holdings, metrics, portfolioId, onEdit, onDelete,
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

  // `w-5 shrink-0` pins this to the 20px it happened to render at before: the
  // width used to be a flex-shrink accident, and without the pin the Value column
  // grew 20px and took the table (1011px in a 974px box at 1280) further into
  // sideways scrolling. These buttons are never the touch target — below lg the
  // table is replaced by the cards, whose sort control is a 44px select.
  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-auto w-5 shrink-0 p-0 font-medium"
      aria-label={`Sort by ${label}`}
      onClick={() => toggleSort(col)}
    >
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <>
      {/* Phones and tablets: a ten-column table needs ~990px, so below lg the
          same rows render as cards instead — the layout the app's own grids call
          "big screen" starts at lg. Same data, same sort state, same actions,
          deliberately not a second code path for the values. */}
      <div className="space-y-3 lg:hidden">
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
            {sortDir === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>

        <ul className="space-y-3">
          {sorted.map((holding) => {
            const m = metrics.find((x) => x.holdingId === holding.id);
            // Nothing price-derived is rendered for an unpriced holding: no Rs 0.00,
            // no fabricated return. Cost and the purchase date are still facts.
            const priced = !!m?.priceAvailable;
            return (
              <li
                key={holding.id}
                className="rounded-lg border bg-card p-4 active:bg-muted/30"
                onClick={() => navigate(ROUTES.STOCK_DETAIL_PATH(portfolioId, holding.symbol))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-primary">{holding.symbol}</div>
                    <div className="truncate text-xs text-muted-foreground">{holding.companyName}</div>
                    {!priced && <UnavailableChip />}
                  </div>
                  <div className="shrink-0 text-right">
                    {priced && m ? (
                      <>
                        <div className="font-mono font-medium">{formatCurrency(m.currentValue, true)}</div>
                        <div className="mt-1"><PLBadge value={m.unrealizedPLPercent} /></div>
                      </>
                    ) : (
                      <div className="font-mono text-muted-foreground">—</div>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs">
                  <Stat label="Shares">{holding.shares.toLocaleString()}</Stat>
                  <Stat label="Avg cost">{formatCurrency(holding.averagePurchasePrice)}</Stat>
                  <Stat label="Price">{priced && m ? formatCurrency(m.currentPrice) : '—'}</Stat>
                  <Stat label="Weight">{priced && m ? `${m.weightInPortfolio.toFixed(1)}%` : '—'}</Stat>
                  <Stat label="Today">
                    {priced && m ? (
                      <span className={m.todayChangePercent >= 0 ? 'text-profit' : 'text-loss'}>
                        {formatPercent(m.todayChangePercent)}
                      </span>
                    ) : '—'}
                  </Stat>
                  <Stat label="Bought">{formatDate(holding.purchaseDate)}</Stat>
                </dl>

                {/* 44x44: the row actions are the only controls in the card. */}
                <div
                  className="mt-3 flex justify-end gap-2 border-t pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={`Edit ${holding.symbol}`}
                    onClick={() => onEdit(holding)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 text-destructive hover:text-destructive"
                    aria-label={`Delete ${holding.symbol}`}
                    onClick={() => onDelete(holding.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* lg and up keep the table, exactly as it shipped: from lg the viewport
          is wide enough for all ten columns when the sidebar is out of the way. */}
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium">
                <span className="flex items-center gap-1">Symbol <SortBtn col="symbol" label="Symbol" /></span>
              </th>
              <th className="px-4 py-3 text-right font-medium">Shares</th>
              <th className="px-4 py-3 text-right font-medium">Avg Cost</th>
              <th className="px-4 py-3 text-right font-medium">Current Price</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="flex items-center justify-end gap-1">Value <SortBtn col="currentValue" label="Value" /></span>
              </th>
              <th className="px-4 py-3 text-right font-medium">Today</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="flex items-center justify-end gap-1">Return <SortBtn col="unrealizedPLPercent" label="Return" /></span>
              </th>
              <th className="px-4 py-3 text-right font-medium">Weight</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((holding) => {
              const m = metrics.find((m) => m.holdingId === holding.id);
              const priced = !!m?.priceAvailable;
              return (
                <tr
                  key={holding.id}
                  className="border-b transition-colors hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(ROUTES.STOCK_DETAIL_PATH(portfolioId, holding.symbol))}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-primary">{holding.symbol}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{holding.companyName}</span>
                      {!priced && <UnavailableChip />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{holding.shares.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(holding.averagePurchasePrice)}</td>
                  <td className="px-4 py-3 text-right font-mono">{priced && m ? formatCurrency(m.currentPrice) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{priced && m ? formatCurrency(m.currentValue, true) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {priced && m && (
                      <span className={cn('font-mono text-xs', m.todayChangePercent >= 0 ? 'text-profit' : 'text-loss')}>
                        {formatPercent(m.todayChangePercent)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {priced && m ? <PLBadge value={m.unrealizedPLPercent} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {priced && m ? `${m.weightInPortfolio.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(holding.purchaseDate)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Edit ${holding.symbol}`}
                        onClick={() => onEdit(holding)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label={`Delete ${holding.symbol}`}
                        onClick={() => onDelete(holding.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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