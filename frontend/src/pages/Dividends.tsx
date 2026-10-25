import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Coins, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader } from '@/components/shared';
import { ScrollReveal } from '@/components/animations';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpectedDividendsTable } from '@/features/dividends/ExpectedDividendsTable';
import { WithholdingToggle } from '@/features/dividends/WithholdingToggle';
import { useWithholdingRate } from '@/features/dividends/useWithholdingRate';
import { useDividendAnnouncements, todayInKarachi } from '@/hooks/useMarketData';
import { usePortfolioStore } from '@/store';
import { ROUTES } from '@/constants';
import { formatDate, formatPkr, formatPrice } from '@/utils/formatters';
import { summariseExpectedDividends, type HoldingRef } from '@/utils/expectedDividends';

interface ReceivedRow {
  key: string;
  date: string;
  symbol: string;
  amountPerShare: number;
  total: number;
  portfolioName: string;
}

/**
 * The Dividends page: what the market has announced against what you hold, and
 * what you have already been paid.
 *
 * The declared side is feed-driven (every announcement dated today or later);
 * the received side is the record you keep in the portfolio itself. They are kept
 * visually separate because one is a claim about the future and the other is
 * money already banked.
 */
export function Dividends() {
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const [rate, setRate] = useWithholdingRate();
  const [portfolioId, setPortfolioId] = useState('all');
  const { data: announcements = [], isLoading, isError, refetch } = useDividendAnnouncements();

  const refs: HoldingRef[] = useMemo(
    () =>
      portfolios.flatMap((portfolio) =>
        portfolio.holdings.map((holding) => ({
          portfolioId: portfolio.id,
          portfolioName: portfolio.name,
          holding,
        })),
      ),
    [portfolios],
  );

  const summary = useMemo(
    () =>
      summariseExpectedDividends(
        portfolioId === 'all' ? refs : refs.filter((ref) => ref.portfolioId === portfolioId),
        announcements,
        rate,
      ),
    [refs, announcements, rate, portfolioId],
  );

  const groups = summary.groups;

  const received: ReceivedRow[] = useMemo(
    () =>
      portfolios
        .flatMap((portfolio) =>
          portfolio.holdings.flatMap((holding) =>
            holding.dividendsReceived.map((dividend) => ({
              key: `${holding.id}:${dividend.id}`,
              date: dividend.date,
              symbol: holding.symbol,
              amountPerShare: dividend.amountPerShare,
              total: dividend.totalAmount,
              portfolioName: portfolio.name,
            })),
          ),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [portfolios],
  );
  const receivedTotal = received.reduce((sum, row) => sum + row.total, 0);
  const undatedPayment = summary.rows.some((row) => !row.paymentDate);

  if (portfolios.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dividends"
          description="Announced payouts on what you hold, and what you have already received."
        />
        <div className="mx-auto max-w-xl py-10">
          <EmptyState
            icon={<Coins className="h-7 w-7" />}
            title="No holdings yet"
            description="Expected dividends are the announced amount per share times the shares you hold — add a portfolio and its holdings first."
            action={<Link className="text-sm font-medium text-primary hover:underline" to={ROUTES.PORTFOLIOS}>Go to portfolios</Link>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dividends"
        description="Announced payouts on what you hold, and what you have already received."
        meta={
          <p className="text-xs text-muted-foreground">
            Announcements dated {formatDate(todayInKarachi())} or later · the feed publishes the
            announcement date only
          </p>
        }
      />

      {/* Headline: the expected total, with the tax switch beside it. */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Expected · announced
              </p>
              {isLoading ? (
                <Skeleton className="mt-2 h-10 w-56" />
              ) : (
                <p
                  data-testid="expected-gross"
                  className="mt-1 font-mono text-3xl font-semibold leading-none tabular-nums sm:text-4xl"
                >
                  {formatPkr(summary.gross)}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                <span data-testid="expected-net" className="font-mono tabular-nums">
                  {formatPkr(summary.net)}
                </span>{' '}
                after {rate}% withholding
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <WithholdingToggle rate={rate} onChange={setRate} />
              <p className="text-xs text-muted-foreground tabular-nums">
                {summary.payouts} payout{summary.payouts === 1 ? '' : 's'} ·{' '}
                {summary.holdingsCovered} holding{summary.holdingsCovered === 1 ? '' : 's'} covered
              </p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Next</dt>
              <dd data-testid="expected-next" className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                {summary.nextDate ? formatDate(summary.nextDate) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Withheld</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                {formatPkr(summary.gross - summary.net)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Payouts</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{summary.payouts}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Covered</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                {summary.holdingsCovered}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  / {portfolioId === 'all' ? refs.length : refs.filter((ref) => ref.portfolioId === portfolioId).length}
                </span>
              </dd>
            </div>
          </dl>

          {undatedPayment && (
            <p className="mt-4 flex items-start gap-2 border-t pt-3 text-[11px] text-muted-foreground">
              <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Same-day announcements do not carry a payment date here. These are announcement
                dates, not pay dates — nothing is inferred.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Filter + rows */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="sr-only">Portfolio</span>
          <select
            value={portfolioId}
            onChange={(event) => setPortfolioId(event.target.value)}
            aria-label="Filter by portfolio"
            className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All portfolios</option>
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </label>
        {summary.holdingsWithout.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No announcement for{' '}
            <span className="font-medium text-foreground">
              {summary.holdingsWithout.slice(0, 6).join(', ')}
              {summary.holdingsWithout.length > 6 ? ` +${summary.holdingsWithout.length - 6}` : ''}
            </span>
          </p>
        )}
      </div>

      {isError ? (
        <ErrorState
          title="Could not load announced dividends"
          description="The market feed did not answer. Your holdings and received dividends are unaffected."
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Coins className="h-7 w-7" />}
          title="Nothing announced for these holdings"
          description={
            announcements.length === 0
              ? 'The feed has no dividend announcements dated today or later.'
              : `The feed lists ${announcements.length} announcement${announcements.length === 1 ? '' : 's'} dated today or later, none for the holdings shown.`
          }
        />
      ) : (
        <ScrollReveal>
          <ExpectedDividendsTable groups={groups} />
        </ScrollReveal>
      )}

      {/* Received: the record you keep, never the feed. */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              Received
            </CardTitle>
            {received.length > 0 && (
              <p className="font-mono text-sm font-semibold tabular-nums">{formatPkr(receivedTotal)}</p>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {received.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No dividends recorded yet. Received dividends are logged per holding in a portfolio.
            </p>
          ) : (
            <ul className="divide-y">
              {received.slice(0, 8).map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold">{row.symbol}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(row.date)}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.portfolioName} · {formatPrice(row.amountPerShare)} per share
                    </span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">{formatPkr(row.total)}</span>
                </li>
              ))}
            </ul>
          )}
          {portfolios[0] && (
            <Link
              to={ROUTES.PORTFOLIO_DETAIL_PATH(portfolios[0].id)}
              className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Open a portfolio's dividend calendar
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
