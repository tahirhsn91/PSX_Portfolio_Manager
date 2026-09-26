import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanySearch } from '@/components/shared';
import { SectorBarChart } from '@/features/charts';
import { useKSE100, useSarmaayaMarket, useSectorPerformance, useStockQuotes, useTopSymbols } from '@/hooks';
import { formatCurrency, formatPercent, formatVolume, formatCompactNumber } from '@/utils';
import type { PSXCompany, SarmaayaRow, StockQuote } from '@/types';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';

/** How many gainers and losers each card lists. */
const MOVERS = 5;
/**
 * How many of the traded scrips the Active Stocks tab renders.
 *
 * The source carries ~484 of them; rendering every row (and a card per row on a
 * phone) costs more than it tells the reader, so the list is capped and says so.
 */
const ACTIVE_CAP = 100;

/** One shape for the list and the table, whichever source filled them. */
interface ListRow {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null;
}

const fromSarmaaya = (r: SarmaayaRow): ListRow => ({
  symbol: r.symbol,
  name: r.name,
  price: r.price,
  changePercent: r.changePercent,
  volume: r.volume,
  marketCap: r.marketCap,
});

const fromQuote = (q: StockQuote): ListRow => ({
  symbol: q.symbol,
  name: q.companyName,
  price: q.currentPrice ?? null,
  changePercent: q.changePercent ?? null,
  volume: q.volume ?? null,
  marketCap: q.marketCap ?? null,
});

/** `formatPercent` takes a number — a missing change has to read as an em dash, not 0.00%. */
const pct = (v: number | null) => (v == null || Number.isNaN(v) ? '—' : formatPercent(v));

export function Market() {
  const navigate = useNavigate();
  const { data: kse100, isLoading: kseLoading } = useKSE100();
  const { data: sectors = [], isLoading: sectorLoading } = useSectorPerformance();

  // The lists below come from sarmaaya.pk: the whole market in two sub-second calls
  // (see services/market/sarmaayaMarket.ts). The scraper feed stays as the fallback,
  // and is only asked for once sarmaaya has failed — its own ranking needs a ~30-second
  // three-page walk, so it must not run behind a source that already answered.
  const { data: tape, isLoading: tapeLoading, error: tapeError, isFetching: tapeFetching } = useSarmaayaMarket(MOVERS);
  const usingFeed = !!tapeError;
  const { data: topSymbols = [] } = useTopSymbols(20, usingFeed);
  const { data: feedQuotes = [], isLoading: feedLoading } = useStockQuotes(usingFeed ? topSymbols : []);

  const servedByTape = !!tape && !usingFeed;

  const active = useMemo<ListRow[]>(
    () => (servedByTape ? tape!.active.map(fromSarmaaya) : feedQuotes.map(fromQuote)),
    [servedByTape, tape, feedQuotes],
  );

  const gainers = useMemo<ListRow[]>(() => {
    if (servedByTape) return tape!.gainers.map(fromSarmaaya);
    return [...feedQuotes]
      .filter((q) => (q.changePercent ?? 0) > 0)
      .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
      .slice(0, MOVERS)
      .map(fromQuote);
  }, [servedByTape, tape, feedQuotes]);

  const losers = useMemo<ListRow[]>(() => {
    if (servedByTape) return tape!.losers.map(fromSarmaaya);
    return [...feedQuotes]
      .filter((q) => (q.changePercent ?? 0) < 0)
      .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))
      .slice(0, MOVERS)
      .map(fromQuote);
  }, [servedByTape, tape, feedQuotes]);

  const listsLoading = usingFeed ? feedLoading && !feedQuotes.length : tapeLoading && !tape;

  const handleCompanySelect = (company: PSXCompany) => {
    navigate(ROUTES.MARKET_STOCK_PATH(company.symbol));
  };

  // Say where the numbers come from and which session they belong to. The session date
  // is the source's own, not the clock's: read on a Saturday, this is Friday's tape.
  const session = tape?.source.sessionDate ? format(parseISO(tape.source.sessionDate), 'EEE d MMM yyyy') : null;
  const caption = usingFeed
    ? `sarmaaya.pk could not be reached (${tapeError instanceof Error ? tapeError.message : 'request failed'}) — these lists are the PSX feed's own ranking instead.`
    : tape
      ? tape.source.stale
        ? `sarmaaya.pk stopped answering, so this is the last good snapshot it gave us — ${tape.counts.traded} traded scrips, session ${session}.`
        : `${tape.counts.traded} traded scrips from sarmaaya.pk, session ${session} — ${tape.counts.gainers} up, ${tape.counts.losers} down, and the list ranked by traded volume. Refreshed every minute.`
      : 'Reading the PSX tape from sarmaaya.pk…';

  const visible = active.slice(0, ACTIVE_CAP);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Search */}
      <CompanySearch
        onSelect={handleCompanySelect}
        placeholder="Search PSX company or ticker..."
        className="max-w-lg"
      />

      <p className="text-xs text-muted-foreground">{caption}</p>

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
          <TabsTrigger value="active">Active Stocks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Gainers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-profit" /> Top Gainers
                  {tapeFetching && !listsLoading && <span className="text-xs font-normal text-muted-foreground">refreshing…</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {listsLoading ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : gainers.length ? (
                  <div className="space-y-2">
                    {gainers.map((r) => (
                      <button
                        key={r.symbol}
                        onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(r.symbol))}
                        className="flex w-full items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-primary">{r.symbol}</span>
                          <span className="text-xs text-muted-foreground hidden sm:block">{r.name.split(' ').slice(0, 3).join(' ')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono">{formatCurrency(r.price)}</span>
                          <Badge variant="profit">{pct(r.changePercent)}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing gained ground in this session.</p>
                )}
              </CardContent>
            </Card>

            {/* Top Losers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-loss" /> Top Losers
                  {tapeFetching && !listsLoading && <span className="text-xs font-normal text-muted-foreground">refreshing…</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {listsLoading ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : losers.length ? (
                  <div className="space-y-2">
                    {losers.map((r) => (
                      <button
                        key={r.symbol}
                        onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(r.symbol))}
                        className="flex w-full items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-primary">{r.symbol}</span>
                          <span className="text-xs text-muted-foreground hidden sm:block">{r.name.split(' ').slice(0, 3).join(' ')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono">{formatCurrency(r.price)}</span>
                          <Badge variant="loss">{pct(r.changePercent)}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing lost ground in this session.</p>
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

        <TabsContent value="active" className="mt-4">
          {active.length > visible.length && (
            <p className="mb-3 text-xs text-muted-foreground">
              Showing the {visible.length} most-traded of {active.length} traded scrips — most-traded first. A scrip
              outside this list is one symbol search away.
            </p>
          )}

          {/* Phones get cards: six numeric columns at 390px are not a readable
              list, and the row is the tap target for the stock page. */}
          <ul className="space-y-3 lg:hidden">
            {listsLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="rounded-lg border bg-card p-4">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="mt-2 h-4 w-40" />
                    <Skeleton className="mt-3 h-4 w-full" />
                  </li>
                ))
              : visible.map((r) => (
                  <li
                    key={r.symbol}
                    className="rounded-lg border bg-card p-4 active:bg-muted/30"
                    onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(r.symbol))}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-primary">{r.symbol}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.name}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono">{formatCurrency(r.price)}</div>
                        <div className={cn('font-mono text-xs font-medium', (r.changePercent ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                          {pct(r.changePercent)}
                        </div>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Volume</dt>
                        <dd className="font-mono">{formatVolume(r.volume)}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <dt className="text-muted-foreground">Mkt Cap</dt>
                        <dd className="font-mono">{formatCompactNumber(r.marketCap)}</dd>
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
                {listsLoading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4" /></td>
                        ))}
                      </tr>
                    ))
                  : visible.map((r) => (
                      <tr
                        key={r.symbol}
                        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => navigate(ROUTES.MARKET_STOCK_PATH(r.symbol))}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-primary">{r.symbol}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.name}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(r.price)}</td>
                        <td className={cn('px-4 py-3 text-right font-medium', (r.changePercent ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                          {pct(r.changePercent)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatVolume(r.volume)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCompactNumber(r.marketCap)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!listsLoading && !visible.length && (
            <p className="text-sm text-muted-foreground">
              {usingFeed
                ? 'The PSX feed returned no priced symbols, so there is nothing to list.'
                : 'sarmaaya.pk returned no traded symbols for this session.'}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
