import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanySearch } from '@/components/shared';
import { SectorBarChart } from '@/features/charts';
import { useKSE100, useSectorPerformance, useStockQuotes, useTopSymbols } from '@/hooks';
import { formatCurrency, formatPercent, formatVolume, formatCompactNumber } from '@/utils';
import type { PSXCompany } from '@/types';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';

export function Market() {
  const navigate = useNavigate();
  const { data: kse100, isLoading: kseLoading } = useKSE100();
  const { data: sectors = [], isLoading: sectorLoading } = useSectorPerformance();
  // Which symbols the overview lists: the feed's own most-traded. This used to rank a
  // bundled catalogue by hardcoded market caps (the feed publishes none), so the list
  // never changed and its order was fiction.
  const { data: topSymbols = [], isLoading: symbolsLoading } = useTopSymbols(20);
  const { data: quotes = [], isLoading: quotesLoading } = useStockQuotes(topSymbols);

  const handleCompanySelect = (company: PSXCompany) => {
    navigate(ROUTES.MARKET_STOCK_PATH(company.symbol));
  };

  const gainers = [...quotes].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
  const losers = [...quotes].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Search */}
      <CompanySearch
        onSelect={handleCompanySelect}
        placeholder="Search PSX company or ticker..."
        className="max-w-lg"
      />

      {/* Say where the list comes from: every figure on this page is the scraper
          feed's, and the ranking is the feed's own traded volume. */}
      <p className="text-xs text-muted-foreground">
        {symbolsLoading
          ? 'Ranking the feed’s most-traded symbols…'
          : quotes.length > 0
            ? `Top ${quotes.length} symbols by traded volume — ranked and priced from the scraped PSX feed.`
            : 'The feed has not reported any priced symbols, so there is nothing to rank yet.'}
      </p>

      {/* KSE100 Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-muted-foreground">KSE-100 Index</p>
              {kseLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : kse100 ? (
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold">{kse100.value.toLocaleString()}</p>
                  <Badge variant={kse100.changePercent >= 0 ? 'profit' : 'loss'} className="text-sm gap-1">
                    {kse100.changePercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {formatPercent(kse100.changePercent)}
                  </Badge>
                </div>
              ) : (
                // No index from the provider — say so instead of printing 0, which
                // reads as a flat market rather than missing data.
                <p className="text-2xl font-bold text-muted-foreground">Not available</p>
              )}
            </div>
            <div className="flex gap-6 text-sm">
              {[
                ['Open', kse100?.open],
                ['High', kse100?.high],
                ['Low', kse100?.low],
                ['Volume', kse100 ? formatCompactNumber(kse100.volume) : null],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-semibold">{val?.toLocaleString() ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sectors">Sectors</TabsTrigger>
          <TabsTrigger value="all">All Stocks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Gainers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-profit" /> Top Gainers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quotesLoading ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {gainers.map((q) => (
                      <button
                        key={q.symbol}
                        onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(q.symbol))}
                        className="flex w-full items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-primary">{q.symbol}</span>
                          <span className="text-xs text-muted-foreground hidden sm:block">{q.companyName.split(' ').slice(0, 3).join(' ')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono">{formatCurrency(q.currentPrice)}</span>
                          <Badge variant="profit">+{q.changePercent.toFixed(2)}%</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Losers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-loss" /> Top Losers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quotesLoading ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {losers.map((q) => (
                      <button
                        key={q.symbol}
                        onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(q.symbol))}
                        className="flex w-full items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-primary">{q.symbol}</span>
                          <span className="text-xs text-muted-foreground hidden sm:block">{q.companyName.split(' ').slice(0, 3).join(' ')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono">{formatCurrency(q.currentPrice)}</span>
                          <Badge variant="loss">{q.changePercent.toFixed(2)}%</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sectors" className="mt-4">
          {sectorLoading ? (
            <Skeleton className="h-80" />
          ) : (
            <SectorBarChart data={sectors} title="All Sectors — Today's Performance" />
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {/* Phones get cards: six numeric columns at 390px are not a readable
              list, and the row is the tap target for the stock page. */}
          <ul className="space-y-3 lg:hidden">
            {quotesLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="rounded-lg border bg-card p-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="mt-2 h-4 w-40" />
                    <Skeleton className="mt-3 h-4 w-full" />
                  </li>
                ))
              : quotes.map((q) => (
                  <li
                    key={q.symbol}
                    className="rounded-lg border bg-card p-4 active:bg-muted/30"
                    onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(q.symbol))}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-primary">{q.symbol}</div>
                        <div className="truncate text-xs text-muted-foreground">{q.companyName}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono">{formatCurrency(q.currentPrice)}</div>
                        <div className={cn('font-mono text-xs font-medium', q.changePercent >= 0 ? 'text-profit' : 'text-loss')}>
                          {formatPercent(q.changePercent)}
                        </div>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Volume</dt>
                        <dd className="font-mono">{formatVolume(q.volume)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Mkt Cap</dt>
                        <dd className="font-mono">{formatCompactNumber(q.marketCap)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Symbol</th>
                  <th className="px-4 py-3 text-left font-medium">Company</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Change</th>
                  <th className="px-4 py-3 text-right font-medium">Volume</th>
                  <th className="px-4 py-3 text-right font-medium">Mkt Cap</th>
                </tr>
              </thead>
              <tbody>
                {quotesLoading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4" /></td>
                        ))}
                      </tr>
                    ))
                  : quotes.map((q) => (
                      <tr
                        key={q.symbol}
                        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(q.symbol))}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-primary">{q.symbol}</td>
                        <td className="px-4 py-3 text-muted-foreground">{q.companyName}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(q.currentPrice)}</td>
                        <td className={cn('px-4 py-3 text-right font-medium', q.changePercent >= 0 ? 'text-profit' : 'text-loss')}>
                          {formatPercent(q.changePercent)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatVolume(q.volume)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCompactNumber(q.marketCap)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}