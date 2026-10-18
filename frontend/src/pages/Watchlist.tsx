/**
 * The personal watchlist (issue #93).
 *
 * Symbols tracked but not owned. Server-backed and keyed to the account, so it
 * survives a reload and follows the user across devices. Each row is priced from
 * the live feed at render time — the list itself stores only the symbols.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, Trash2 } from 'lucide-react';
import { PageHeader, CompanySearch, EmptyState } from '@/components/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { watchlistApi } from '@/services';
import { useStockQuotes } from '@/hooks';
import { useMarketStore, useUIStore } from '@/store';
import { formatCurrency, formatPercent } from '@/utils';
import type { PSXCompany, StockQuote } from '@/types';

export function Watchlist() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore((s) => s.addNotification);

  const { data: items = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: watchlistApi.list,
  });

  const symbols = items.map((i) => i.symbol);
  useStockQuotes(symbols);
  const quotes = useMarketStore((s) => s.quotes);

  const add = useMutation({
    mutationFn: (symbol: string) => watchlistApi.add(symbol),
    onSuccess: (_item, symbol) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      addNotification({ type: 'success', title: `${symbol} added to your watchlist` });
    },
    onError: (err) => {
      addNotification({ type: 'error', title: 'Could not add the symbol', message: (err as Error).message });
    },
  });

  const remove = useMutation({
    mutationFn: (symbol: string) => watchlistApi.remove(symbol),
    onSuccess: (_item, symbol) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      addNotification({ type: 'info', title: `${symbol} removed from your watchlist` });
    },
    onError: (err) => {
      addNotification({ type: 'error', title: 'Could not remove the symbol', message: (err as Error).message });
    },
  });

  const quoteFor = (symbol: string): StockQuote | undefined => quotes[symbol]?.data;

  const handleSelect = (company: PSXCompany) => {
    if (!items.some((i) => i.symbol === company.symbol)) add.mutate(company.symbol);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Watchlist' }]}
        title="Watchlist"
        description="Symbols you're keeping an eye on, separate from anything you own."
      />

      <Card>
        <CardContent className="pt-6">
          <label className="mb-2 block text-sm font-medium">Add a symbol</label>
          <CompanySearch
            onSelect={handleSelect}
            placeholder="Search a company or ticker to watch…"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Prices are live from the feed and never stored with the list.
          </p>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={<Star className="h-6 w-6" />}
          title="Nothing on your watchlist yet"
          description="Search above to start tracking a symbol — it'll stay here, separate from your holdings."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="divide-y">
              {items.map((item) => {
                const quote = quoteFor(item.symbol);
                const unavailable = quote?.priceAvailable === false;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-semibold">
                        {item.symbol}
                      </span>
                      {quote && !unavailable && (
                        <p className="truncate text-xs text-muted-foreground">{quote.companyName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {unavailable ? (
                          <span className="text-sm text-muted-foreground">unavailable</span>
                        ) : quote ? (
                          <>
                            <span className="block font-mono text-sm font-medium tabular-nums">
                              {formatCurrency(quote.currentPrice)}
                            </span>
                            <span
                              className={`block text-xs tabular-nums ${
                                quote.change >= 0 ? 'text-profit' : 'text-loss'
                              }`}
                            >
                              {quote.change >= 0 ? '+' : ''}
                              {formatCurrency(quote.change)} ({formatPercent(quote.changePercent)})
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">…</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remove ${item.symbol} from your watchlist`}
                        onClick={() => remove.mutate(item.symbol)}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
