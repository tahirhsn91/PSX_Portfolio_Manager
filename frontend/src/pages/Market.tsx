import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Building2, LineChart, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanySearch, EmptyState, ErrorState, PageHeader } from '@/components/shared';
import { SectorBarChart } from '@/features/charts';
import {
  ACTIVE_CAP,
  MOVERS,
  changeTone,
  compactText,
  fromQuote,
  fromSarmaaya,
  levelText,
  pct,
  shortName,
  type ListRow,
} from '@/features/market/marketRows';
import { useKSE100, useSarmaayaMarket, useSectorPerformance, useStockQuotes, useTopSymbols } from '@/hooks';
import { formatCurrency, formatPercent, formatVolume, formatCompactNumber } from '@/utils';
import type { PSXCompany } from '@/types';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';

/** The row rhythm every list on this page shares: 44px tall, one focus ring. */
const ROW_LINK =
  'min-h-11 rounded-md transition-colors duration-base ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Five list-shaped placeholder rows — the shape the rows will have, at their height. */
function ListSkeleton({ rows = MOVERS }: { rows?: number }) {
  return (
    <div className="space-y-1" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex min-h-11 items-center gap-3 px-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-28 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function Market() {
  const navigate = useNavigate();
  const { data: kse100, isLoading: kseLoading, error: kseError, refetch: refetchKse } = useKSE100();
  const {
    data: sectors = [],
    isLoading: sectorLoading,
    error: sectorError,
    refetch: refetchSectors,
  } = useSectorPerformance();

  // The lists below come from sarmaaya.pk: the whole market in two sub-second calls
  // (see services/market/sarmaayaMarket.ts). The scraper feed stays as the fallback,
  // and is only asked for once sarmaaya has failed — its own ranking needs a ~30-second
  // three-page walk, so it must not run behind a source that already answered.
  const {
    data: tape,
    isLoading: tapeLoading,
    error: tapeError,
    isFetching: tapeFetching,
    refetch: refetchTape,
  } = useSarmaayaMarket(MOVERS);
  const usingFeed = !!tapeError;
  const { data: topSymbols = [], error: topSymbolsError, refetch: refetchTopSymbols } = useTopSymbols(20, usingFeed);
  const {
    data: feedQuotes = [],
    isLoading: feedLoading,
    error: feedError,
    refetch: refetchQuotes,
  } = useStockQuotes(usingFeed ? topSymbols : []);

  const servedByTape = !!tape && !usingFeed;

  // The KSE-100 banner. sarmaaya is the only source that publishes an index's high, low,
  // volume and close, and it publishes no opening level at all; the feed's own index reading
  // does carry one — the first reading of the session, captured by the scraper — so the tile
  // takes it from there, and only when that reading is the *same session* as the levels above.
  // A feed a session behind would otherwise print its open beside a newer close, which is what
  // reads as one session's row. The feed is the whole fallback: when sarmaaya is unreachable the
  // banner comes from the feed, em dashes included, and the two are never mixed in one row.
  const levels = servedByTape ? tape?.index ?? null : null;
  const indexValue = levels?.close ?? kse100?.value ?? null;
  const indexChangePercent = levels?.changePercent ?? kse100?.changePercent ?? null;
  const feedOpen = kse100?.open ?? null;
  // Both sources quote the exchange's own level, so agreeing to within a hair of a percent means
  // they are describing the same session — that is the test, because the feed's reading carries
  // no date of its own. A reading from another session shows the dash it stands in for.
  const feedIsSameSession =
    indexValue !== null &&
    kse100?.value != null &&
    Math.abs(kse100.value - indexValue) <= Math.max(1, indexValue * 0.0005);
  const openShown = levels ? (feedIsSameSession ? feedOpen : null) : feedOpen;

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

  /**
   * The lists failed only when *both* sources failed: sarmaaya is asked first and the
   * feed is asked because it did. So an error is "the fallback that replaced sarmaaya
   * also failed" — sarmaaya's own failure is the fallback's cue, not an error on screen.
   */
  const listsError = usingFeed ? topSymbolsError ?? feedError ?? null : null;
  const indexError = kseError && !levels ? kseError : null;

  const handleCompanySelect = (company: PSXCompany) => {
    navigate(ROUTES.MARKET_STOCK_PATH(company.symbol));
  };

  // Re-read whichever source is currently filling the lists — and, after a sarmaaya
  // failure, the feed side of the fallback too.
  const retryLists = () => {
    refetchTape();
    if (usingFeed) {
      refetchTopSymbols();
      refetchQuotes();
    }
  };
  const retryIndex = () => {
    refetchKse();
    if (usingFeed) refetchTape();
  };
  const retrySectors = () => {
    refetchSectors();
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
  const showActiveList = !listsLoading && !listsError && visible.length > 0;

  return (
    <div className="space-y-6">
      {/* One page title, from the one component that owns it — this page had none, so
          the KSE-100 card was doing the job of a heading. */}
      <PageHeader
        title="Market"
        description="The session's movers, its sector moves, and the most-traded scrips on the PSX tape."
        meta={
          usingFeed ? (
            // A degraded source is information, not an error: the page still has data.
            // It reads as a notice because that is what it is.
            <p className="mt-1 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-light p-3 text-xs text-warning-dark">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{caption}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
          )
        }
      />

      {/* Search — the way to any scrip the lists don't carry. */}
      <CompanySearch
        onSelect={handleCompanySelect}
        placeholder="Search PSX company or ticker..."
        className="w-full sm:max-w-lg"
      />

      {/* KSE-100 banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">KSE-100 Index</p>
              {indexError ? (
                <ErrorState
                  className="mt-3 items-start justify-start border-0 bg-transparent p-0 text-left"
                  title="The KSE-100 level could not be loaded"
                  description="Neither the market tape nor the PSX feed answered for the index. The lists below are unaffected."
                  detail={indexError instanceof Error ? indexError.message : undefined}
                  onRetry={retryIndex}
                />
              ) : kseLoading && indexValue == null ? (
                <div className="mt-2 space-y-2" aria-busy="true">
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ) : indexValue != null ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                    {indexValue.toLocaleString()}
                  </p>
                  {indexChangePercent != null && (
                    <p
                      className={cn(
                        'flex items-center gap-1 text-sm font-medium tabular-nums',
                        changeTone(indexChangePercent),
                      )}
                    >
                      {indexChangePercent >= 0 ? (
                        <TrendingUp aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <TrendingDown aria-hidden="true" className="h-4 w-4" />
                      )}
                      {formatPercent(indexChangePercent)} today
                    </p>
                  )}
                </div>
              ) : (
                // No index from either source — said plainly, instead of printing 0,
                // which would read as a flat market rather than missing data.
                <EmptyState
                  className="mt-2 items-start justify-start gap-2 border-0 bg-transparent p-0 text-left"
                  title="No KSE-100 level for this session"
                  description="The feed has not published an index reading yet; the lists below come from the tape."
                />
              )}
            </div>
            {/* Wraps: five levels do not fit one line at phone width, and a row that
                clips inside the card still reports no *page* overflow. */}
            {(indexValue != null || kseLoading) && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5 lg:justify-items-end">
                {[
                  ['Open', levelText(openShown)],
                  ['High', levelText(levels?.high ?? kse100?.high)],
                  ['Low', levelText(levels?.low ?? kse100?.low)],
                  ['Close', levelText(indexValue)],
                  ['Volume', compactText(levels?.volume ?? kse100?.volume)],
                ].map(([label, val]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-semibold tabular-nums">{val}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          {levels && (
            <p className="mt-4 text-xs text-muted-foreground">
              Session levels (high, low, close, volume) from sarmaaya.pk · open from the PSX
              feed&apos;s own index reading, its first reading of the session, shown when it belongs
              to the same session as these levels.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sectors">Sectors</TabsTrigger>
          <TabsTrigger value="active">Active Stocks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top Gainers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp aria-hidden="true" className="h-4 w-4 text-profit" /> Top gainers
                  {tapeFetching && !listsLoading && (
                    <span className="text-xs font-normal text-muted-foreground">refreshing…</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {listsLoading ? (
                  <ListSkeleton />
                ) : listsError ? (
                  <ErrorState
                    className="p-4"
                    title="The gainers list could not be loaded"
                    description="Neither sarmaaya.pk nor the PSX feed answered."
                    detail={listsError instanceof Error ? listsError.message : undefined}
                    onRetry={retryLists}
                  />
                ) : gainers.length === 0 ? (
                  <EmptyState
                    className="gap-2 border-0 bg-transparent p-6"
                    title="No companies match this session's gainers"
                    description="Nothing on the tape is up — its losers are in the next card."
                  />
                ) : (
                  <ul className="divide-y">
                    {gainers.map((r) => (
                      <li key={r.symbol}>
                        <Link to={ROUTES.MARKET_STOCK_PATH(r.symbol)} className={cn('flex items-center gap-3 px-2', ROW_LINK)}>
                          <span className="flex min-w-0 flex-1 items-baseline gap-2">
                            {/* A symbol is an identifier, so it is set in the mono face. */}
                            <span className="font-mono text-sm font-semibold text-primary">{r.symbol}</span>
                            <span className="truncate text-xs text-muted-foreground">{shortName(r.name)}</span>
                          </span>
                          <span className="shrink-0 font-mono text-sm tabular-nums">{formatCurrency(r.price)}</span>
                          <span className={cn('w-20 shrink-0 text-right text-xs font-medium tabular-nums', changeTone(r.changePercent))}>
                            {pct(r.changePercent)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Top Losers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown aria-hidden="true" className="h-4 w-4 text-loss" /> Top losers
                  {tapeFetching && !listsLoading && (
                    <span className="text-xs font-normal text-muted-foreground">refreshing…</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                {listsLoading ? (
                  <ListSkeleton />
                ) : listsError ? (
                  <ErrorState
                    className="p-4"
                    title="The losers list could not be loaded"
                    description="Neither sarmaaya.pk nor the PSX feed answered."
                    detail={listsError instanceof Error ? listsError.message : undefined}
                    onRetry={retryLists}
                  />
                ) : losers.length === 0 ? (
                  <EmptyState
                    className="gap-2 border-0 bg-transparent p-6"
                    title="No companies match this session's losers"
                    description="Nothing on the tape is down — its gainers are in the previous card."
                  />
                ) : (
                  <ul className="divide-y">
                    {losers.map((r) => (
                      <li key={r.symbol}>
                        <Link to={ROUTES.MARKET_STOCK_PATH(r.symbol)} className={cn('flex items-center gap-3 px-2', ROW_LINK)}>
                          <span className="flex min-w-0 flex-1 items-baseline gap-2">
                            <span className="font-mono text-sm font-semibold text-primary">{r.symbol}</span>
                            <span className="truncate text-xs text-muted-foreground">{shortName(r.name)}</span>
                          </span>
                          <span className="shrink-0 font-mono text-sm tabular-nums">{formatCurrency(r.price)}</span>
                          <span className={cn('w-20 shrink-0 text-right text-xs font-medium tabular-nums', changeTone(r.changePercent))}>
                            {pct(r.changePercent)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sectors">
          {sectorError ? (
            <ErrorState
              title="Sector performance could not be loaded"
              description="The feed did not answer for this session's sector rows."
              detail={sectorError instanceof Error ? sectorError.message : undefined}
              onRetry={retrySectors}
            />
          ) : sectorLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[280px] w-full rounded-lg" />
              </CardContent>
            </Card>
          ) : sectors.length === 0 ? (
            <EmptyState
              icon={<LineChart className="h-6 w-6" />}
              title="No sector moves for this session"
              description="The feed publishes sector performance once the market has traded."
            />
          ) : (
            <SectorBarChart data={sectors} title="All sectors — today's performance" />
          )}
        </TabsContent>

        <TabsContent value="active">
          {showActiveList && active.length > visible.length && (
            <p className="mb-3 text-xs text-muted-foreground">
              Showing the {visible.length} most-traded of {active.length} traded scrips — most-traded first. A scrip
              outside this list is one symbol search away.
            </p>
          )}

          {listsError ? (
            <ErrorState
              title="The traded-scrips list could not be loaded"
              description="Neither sarmaaya.pk nor the PSX feed answered."
              detail={listsError instanceof Error ? listsError.message : undefined}
              onRetry={retryLists}
            />
          ) : !listsLoading && !visible.length ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="No companies match this session's traded list"
              description={
                usingFeed
                  ? 'The PSX feed returned no priced symbols, so there is nothing to list.'
                  : 'sarmaaya.pk returned no traded symbols for this session.'
              }
            />
          ) : (
            <>
              {/* Phones get cards: six numeric columns at 390px are not a readable
                  list, and the whole card is the tap target for the stock page. */}
              <ul className="space-y-3 lg:hidden">
                {listsLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <li key={i} className="rounded-xl border bg-card p-4" aria-busy="true">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="mt-2 h-3 w-40" />
                        <Skeleton className="mt-3 h-4 w-full" />
                      </li>
                    ))
                  : visible.map((r) => (
                      <li key={r.symbol}>
                        <Link
                          to={ROUTES.MARKET_STOCK_PATH(r.symbol)}
                          className="block rounded-xl border bg-card p-4 shadow-card transition-colors duration-base ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block font-mono text-sm font-semibold text-primary">{r.symbol}</span>
                              <span className="block truncate text-xs text-muted-foreground">{r.name}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-mono text-sm tabular-nums">{formatCurrency(r.price)}</span>
                              <span className={cn('block text-xs font-medium tabular-nums', changeTone(r.changePercent))}>
                                {pct(r.changePercent)}
                              </span>
                            </span>
                          </span>
                          <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-xs">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-muted-foreground">Volume</span>
                              <span className="font-mono tabular-nums">{formatVolume(r.volume)}</span>
                            </span>
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-muted-foreground">Mkt Cap</span>
                              <span className="font-mono tabular-nums">{formatCompactNumber(r.marketCap)}</span>
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-xl border lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-surface-2">
                      {['Symbol', 'Company', 'Price', 'Change', 'Volume', 'Mkt Cap'].map((head, i) => (
                        <th
                          key={head}
                          scope="col"
                          className={cn(
                            'px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground',
                            i < 2 ? 'text-left' : 'text-right',
                          )}
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listsLoading
                      ? Array.from({ length: 10 }).map((_, i) => (
                          <tr key={i} className="border-b" aria-busy="true">
                            {Array.from({ length: 6 }).map((_, j) => (
                              <td key={j} className="px-4 py-3">
                                <Skeleton className="h-4" />
                              </td>
                            ))}
                          </tr>
                        ))
                      : visible.map((r) => (
                          <tr
                            key={r.symbol}
                            className="relative border-b transition-colors duration-base ease-standard hover:bg-surface-2"
                          >
                            {/* The row is the link: one keyboard stop, one focus ring, and a
                                hit area the whole row wide — instead of a `tr` with onClick,
                                which no keyboard could reach. The stretched overlay is what
                                keeps the row clickable without a second, focusable control. */}
                            <td className="px-4 py-3 font-mono text-sm font-semibold">
                              {/* min-h/min-w keep the control's own box at 44x44, and the
                                  stretched overlay makes the whole row the target — so it
                                  passes a touch-target audit whichever way it is measured. */}
                              <Link
                                to={ROUTES.MARKET_STOCK_PATH(r.symbol)}
                                className="inline-flex min-h-11 min-w-11 items-center rounded-sm text-primary after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                {r.symbol}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{r.name}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums">{formatCurrency(r.price)}</td>
                            <td className={cn('px-4 py-3 text-right font-medium tabular-nums', changeTone(r.changePercent))}>
                              {pct(r.changePercent)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatVolume(r.volume)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {formatCompactNumber(r.marketCap)}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
