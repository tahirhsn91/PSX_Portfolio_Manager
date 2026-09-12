import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const SortBtn = ({ col }: { col: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => toggleSort(col)}>
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium">
              <span className="flex items-center gap-1">Symbol <SortBtn col="symbol" /></span>
            </th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">Avg Cost</th>
            <th className="px-4 py-3 text-right font-medium">Current Price</th>
            <th className="px-4 py-3 text-right font-medium">
              <span className="flex items-center justify-end gap-1">Value <SortBtn col="currentValue" /></span>
            </th>
            <th className="px-4 py-3 text-right font-medium">Today</th>
            <th className="px-4 py-3 text-right font-medium">
              <span className="flex items-center justify-end gap-1">Return <SortBtn col="unrealizedPLPercent" /></span>
            </th>
            <th className="px-4 py-3 text-right font-medium">Weight</th>
            <th className="px-4 py-3 text-left font-medium">Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((holding) => {
            const m = metrics.find((m) => m.holdingId === holding.id);
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
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">{holding.shares.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono">{formatCurrency(holding.averagePurchasePrice)}</td>
                <td className="px-4 py-3 text-right font-mono">{m ? formatCurrency(m.currentPrice) : '—'}</td>
                <td className="px-4 py-3 text-right font-mono font-medium">{m ? formatCurrency(m.currentValue, true) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  {m && (
                    <span className={cn('font-mono text-xs', m.todayChangePercent >= 0 ? 'text-profit' : 'text-loss')}>
                      {formatPercent(m.todayChangePercent)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {m && <PLBadge value={m.unrealizedPLPercent} />}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                  {m ? `${m.weightInPortfolio.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDate(holding.purchaseDate)}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(holding)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(holding.id)}>
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
  );
}
