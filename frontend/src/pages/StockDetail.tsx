import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, MetricCard, PageHeader, RangeBar } from '@/components/shared';
import { StockPriceChart } from '@/features/charts';
import { PredictionPanel } from '@/features/prediction/PredictionPanel';
import { useStockDetail, useHistoricalData, useStockPrediction } from '@/hooks';
import { usePortfolioStore } from '@/store';
import {
  formatCurrency,
  formatPercent,
  formatDate,
  formatVolume,
  formatCompactNumber,
  deriveDayRange,
  feedSessionDay,
  activeSessionDate,
} from '@/utils';
import type { StockDetail as StockDetailData } from '@/types';
import { ROUTES } from '@/constants';
import { format, subYears, subDays, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

export interface StockDetailProps {
  /**
   * Which reading context the page is in. The portfolio route carries a
   * `portfolioId` and the market route does not, so the page derives it from the
   * params; `MarketStockDetail` states it outright for the route that has no
   * portfolio to name.
   */
  variant?: 'portfolio' | 'market';
}

/** One label/value pair in the figures card. */
interface Figure {
  label: string;
  value: string;
  /** A clarifier under the value — e.g. what a date actually is. */
  note?: string;
}

/**
 * Every figure the detail payload carries, in one list: the exchange's market data
 * first, then valuation. The page used to split this across two near-identical
 * label/value cards, which read as two copies of one thing.
 */
function figures(detail: StockDetailData): Figure[] {
  return [
    { label: 'Open', value: formatCurrency(detail.open) },
    { label: 'Previous close', value: formatCurrency(detail.previousClose) },
    { label: 'Day high', value: formatCurrency(detail.high) },
    { label: 'Day low', value: formatCurrency(detail.low) },
    { label: '52W high', value: formatCurrency(detail.week52High) },
    { label: '52W low', value: formatCurrency(detail.week52Low) },
    { label: 'Avg volume', value: formatVolume(detail.averageVolume) },
    {
      label: 'Market cap',
      value: detail.marketCap == null ? '—' : formatCompactNumber(detail.marketCap) + ' PKR',
    },
    { label: 'P/E ratio', value: detail.peRatio?.toFixed(2) ?? '—' },
    // `!= null`, not a truthiness test: a genuine 0.00 EPS (a company at break-even)
    // is a reading, and a truthiness check would render it as the dash — the same
    // mistake in the other direction.
    { label: 'EPS', value: detail.eps != null ? formatCurrency(detail.eps) : '—' },
    // The figure the feed serves for this symbol, or the dash when it publishes
    // none — never a 0, and never another row's number.
    // (PSX_Scraper#79: this row was hardcoded to a dash in the provider.)
    { label: 'Book value', value: detail.bookValue != null ? formatCurrency(detail.bookValue) : '—' },
    { label: 'Dividend yield', value: detail.dividendYield ? `${detail.dividendYield.toFixed(2)}%` : '—' },
    {
      label: 'Next dividend',
      value: detail.nextDividendAmount ? formatCurrency(detail.nextDividendAmount) + '/share' : '—',
    },
    {
      // The value here is the dividend's *announcement* date: no source upstream
      // publishes an ex-date. A bare date under a date label would read as the
      // ex-date, so the row names the date it carries.
      label: 'Next dividend date',
      value: formatDate(detail.nextDividendDate),
      note: detail.nextDividendDate ? `Announced ${formatDate(detail.nextDividendDate)}` : undefined,
    },
    { label: 'Beta', value: detail.beta?.toFixed(2) ?? '—' },
    { label: 'Sector', value: detail.sector },
  ];
}

export function StockDetail({ variant }: StockDetailProps = {}) {
  const { portfolioId = '', symbol = '' } = useParams<{ portfolioId: string; symbol: string }>();
  const navigate = useNavigate();

  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === portfolioId));
  const holding = portfolio?.holdings.find((h) => h.symbol === symbol);

  const { data: detail, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = useStockDetail(symbol);
  const {
    data: historicalData = [],
    isLoading: histLoading,
    error: histError,
    refetch: refetchHistory,
  } = useHistoricalData(
    symbol,
    format(subYears(new Date(), 1), 'yyyy-MM-dd'),
    format(new Date(), 'yyyy-MM-dd')
  );
  const { data: prediction, isLoading: predLoading } = useStockPrediction(
    symbol,
    detail?.currentPrice,
    holding?.dividendsReceived ?? []
  );

  // The day range needs the *current* session's rows, and the scraper treats
  // `to` as exclusive, so the year-long chart window stops at yesterday. This
  // two-day window is what carries today's intraday rows.
  const {
    data: dayPoints = [],
    isLoading: dayLoading,
    error: dayError,
  } = useHistoricalData(
    symbol,
    format(subDays(new Date(), 1), 'yyyy-MM-dd'),
    format(addDays(new Date(), 1), 'yyyy-MM-dd')
  );

  const isProfit = (detail?.changePercent ?? 0) >= 0;
  // The feed stamps its rows with the session's close time in UTC (11:00Z = 16:00 PKT),
  // so a plain datetime here would read as a time after the close — and mid-session, as
  // the future. What belongs on screen is the session day the figures are from.
  const sessionDay = feedSessionDay(detail?.lastUpdated);
  const sessionIsCurrent = sessionDay !== null && sessionDay === activeSessionDate();

  // Today's range, scoped to the active PSX session: it clears at the 09:00 PKT
  // pre-open rather than carrying the previous session's numbers into the new day.
  const dayRange = deriveDayRange({
    points: dayPoints,
    quotePrice: detail?.currentPrice ?? 0,
    quoteDate: detail?.lastUpdated,
    upstreamLow: detail?.low,
    upstreamHigh: detail?.high,
  });

  const goBack = () => navigate(portfolioId ? ROUTES.PORTFOLIO_DETAIL_PATH(portfolioId) : ROUTES.MARKET);

  // `/market/:symbol` has no portfolio in its params. The page says where "back"
  // goes instead of leaving the reader to guess which of the two it is.
  //
  // There is deliberately no breadcrumb strip: `PageHeader`'s crumb link renders at
  // 37x16px, under the 44px touch minimum this revamp is held to, and that link lives
  // in the shared component rather than here. The named Back control carries the same
  // navigation at 44px, which is what this page had before the crumb.
  const isMarket = variant === 'market' || !portfolioId;

  /** The feed could not price this symbol: every price-derived figure is left out. */
  const priceUnavailable = detail?.priceAvailable === false;

  return (
    <div className="space-y-6">
      {/* One title, and it is the page's own `<h1>`: the old header printed the symbol
          twice (as a heading and again beside the price) with no h1 at all. */}
      <PageHeader
        title={symbol}
        description={detail?.companyName && detail.companyName !== symbol ? detail.companyName : undefined}
        actions={
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft aria-hidden="true" />
            {isMarket ? 'Back to market' : 'Back to portfolio'}
          </Button>
        }
        meta={
          sessionDay ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {sessionIsCurrent ? 'Session' : 'Last session'}{' '}
              {format(new Date(`${sessionDay}T00:00:00`), 'd MMM yyyy')}
              {!sessionIsCurrent && ' — the feed has not published a newer session yet'}
            </p>
          ) : undefined
        }
      />

      {/* One figures grid: the price leads it, and nothing here repeats a figure that
          is already on the page. Every region below owns its loading, empty and error
          state, so a failed fetch never reads as a zero. */}
      {detailError ? (
        <ErrorState
          title={`${symbol} could not be loaded`}
          description="The feed did not answer for this symbol's quote, so no figure on this page can be trusted to be current."
          detail={detailError instanceof Error ? detailError.message : undefined}
          onRetry={() => refetchDetail()}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="sm:col-span-2" aria-busy={detailLoading || undefined}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Price</p>
              {detailLoading && !detail ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-9 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ) : priceUnavailable ? (
                <>
                  <p className="mt-1 text-3xl font-semibold tabular-nums text-muted-foreground">—</p>
                  {/* The one caveat on the page, said once and in the notice tone —
                      not a stray "Not available" line under a number. */}
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-light p-3 text-xs text-warning-dark">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      The PSX feed publishes no price for {symbol}, so the price and every
                      figure derived from it are left blank rather than counted as zero.
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
                    {formatCurrency(detail?.currentPrice ?? 0)}
                  </p>
                  <p
                    className={cn(
                      'mt-1 flex flex-wrap items-center gap-x-1.5 text-sm font-medium tabular-nums',
                      isProfit ? 'text-profit' : 'text-loss',
                    )}
                  >
                    {isProfit ? (
                      <TrendingUp aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <TrendingDown aria-hidden="true" className="h-4 w-4" />
                    )}
                    {isProfit ? '+' : ''}
                    {formatCurrency(detail?.change ?? 0)} ({formatPercent(detail?.changePercent ?? 0)}) today
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* The feed publishes no dividend data, so 0 was a claim that the company pays
              nothing rather than a statement that it is not reported. */}
          <MetricCard
            title="Div. Yield"
            value={detail?.dividendYield != null ? formatPercent(detail.dividendYield) : '—'}
            isLoading={detailLoading}
          />
          <MetricCard
            title="Volume"
            value={detail ? formatVolume(detail.volume) : '—'}
            isLoading={detailLoading}
          />

          {/* Today's range — tied to the active session, cleared at the 09:00 PKT pre-open */}
          <RangeBar
            className="sm:col-span-2"
            label="Day Range"
            lowCaption="Day Low"
            highCaption="Day High"
            low={dayRange.range?.low ?? 0}
            high={dayRange.range?.high ?? 0}
            current={detail?.currentPrice ?? 0}
            source={dayRange.range?.source}
            badge={
              dayRange.isCurrentSession
                ? undefined
                : format(new Date(`${dayRange.sessionDate}T00:00:00`), 'd MMM')
            }
            badgeTitle="Last completed session — the current one hasn't started printing yet."
            unavailableMessage={
              dayError
                ? "Today's intraday rows could not be loaded — the day range needs them."
                : dayRange.message
            }
            isLoading={detailLoading || dayLoading}
          />
          <RangeBar
            className="sm:col-span-2"
            low={detail?.week52Low ?? 0}
            high={detail?.week52High ?? 0}
            current={detail?.currentPrice ?? 0}
            unavailableMessage="The feed publishes no 52-week range for this symbol."
            isLoading={detailLoading}
          />
        </div>
      )}

      {/* Holding info — only for the portfolio route's symbols you own. */}
      {holding && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Your position</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm lg:grid-cols-4">
              {[
                { label: 'Shares', value: holding.shares.toLocaleString() },
                { label: 'Avg cost', value: formatCurrency(holding.averagePurchasePrice) },
                { label: 'Cost basis', value: formatCurrency(holding.shares * holding.averagePurchasePrice, true) },
                { label: 'Held since', value: formatDate(holding.purchaseDate) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Underline tabs: these are three views of one record — its price, its figures
          and its projection — not three modes of the app. */}
      <Tabs defaultValue="chart">
        <TabsList variant="underline">
          <TabsTrigger value="chart">Price chart</TabsTrigger>
          <TabsTrigger value="fundamentals">Fundamentals</TabsTrigger>
          <TabsTrigger value="prediction">Prediction</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          {histError ? (
            <ErrorState
              title={`${symbol}'s price history could not be loaded`}
              description="The feed did not answer for this symbol's daily closes, so there is nothing to plot."
              detail={histError instanceof Error ? histError.message : undefined}
              onRetry={() => refetchHistory()}
            />
          ) : histLoading && !historicalData.length ? (
            <Card aria-busy="true">
              <CardHeader>
                <Skeleton className="h-5 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[300px] w-full rounded-lg" />
              </CardContent>
            </Card>
          ) : (
            <StockPriceChart
              data={historicalData}
              symbol={symbol}
              supportLevels={prediction?.supportLevels}
              resistanceLevels={prediction?.resistanceLevels}
              purchasePrice={holding?.averagePurchasePrice}
              isLoading={histLoading}
            />
          )}
        </TabsContent>

        <TabsContent value="fundamentals">
          {detailLoading ? (
            <Card aria-busy="true">
              <CardHeader>
                <Skeleton className="h-5 w-56" />
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-5" />
                ))}
              </CardContent>
            </Card>
          ) : detailError ? (
            <ErrorState
              title="The figures could not be loaded"
              description="The feed did not answer for this symbol's detail payload."
              detail={detailError instanceof Error ? detailError.message : undefined}
              onRetry={() => refetchDetail()}
            />
          ) : detail ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Market data &amp; valuation</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-10 gap-y-3 text-sm sm:grid-cols-2">
                  {figures(detail).map(({ label, value, note }) => (
                    <div key={label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right">
                        <span className="font-medium tabular-nums">{value}</span>
                        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
                {detail.description && (
                  <div className="mt-5 border-t pt-4">
                    <h3 className="text-sm font-semibold">About {symbol}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              title="No figures for this symbol"
              description="The feed answered with nothing for this symbol — it may be newly listed or not covered."
            />
          )}
        </TabsContent>

        <TabsContent value="prediction">
          <div className="max-w-2xl">
            <PredictionPanel prediction={prediction} isLoading={predLoading} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
