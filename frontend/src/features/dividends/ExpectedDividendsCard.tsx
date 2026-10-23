import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Coins } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatedNumber, ScrollReveal } from '@/components/animations';
import { useDividendAnnouncements } from '@/hooks/useMarketData';
import { useWithholdingRate } from '@/features/dividends/useWithholdingRate';
import { usePortfolioStore } from '@/store';
import { ROUTES } from '@/constants';
import { formatDate, formatPkr } from '@/utils/formatters';
import { summariseExpectedDividends, type HoldingRef } from '@/utils/expectedDividends';

/**
 * The dashboard's dividend summary: the same totals as the Dividends page, with
 * the same 15% rate the user last chose. It links to the page rather than
 * repeating the per-stock rows, so the dashboard stays a summary.
 */
export function ExpectedDividendsCard() {
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const [rate] = useWithholdingRate();
  const { data: announcements = [], isLoading } = useDividendAnnouncements();

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
    () => summariseExpectedDividends(refs, announcements, rate),
    [refs, announcements, rate],
  );

  return (
    <ScrollReveal>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <Coins aria-hidden="true" className="h-3.5 w-3.5" />
              Expected dividends
            </p>
            {isLoading ? (
              <Skeleton className="mt-1.5 h-8 w-40" />
            ) : (
              <p
                data-testid="dash-expected-gross"
                className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums"
              >
                {summary.payouts > 0 ? (
                  <AnimatedNumber value={summary.gross} format={formatPkr} duration={0.6} />
                ) : (
                  formatPkr(0)
                )}
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
              {summary.payouts > 0 ? (
                <>
                  {formatPkr(summary.net)} net after {rate}% ·{' '}
                  {summary.payouts} payout{summary.payouts === 1 ? '' : 's'}
                </>
              ) : (
                'No announcement dated today or later for your holdings'
              )}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {summary.nextDate && (
              <div className="hidden text-right sm:block">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {formatDate(summary.nextDate)}
                </p>
              </div>
            )}
            <Link
              to={ROUTES.DIVIDENDS}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </ScrollReveal>
  );
}
