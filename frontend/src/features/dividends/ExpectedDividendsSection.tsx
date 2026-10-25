import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarClock, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedNumber } from '@/components/animations';
import { WithholdingToggle } from '@/features/dividends/WithholdingToggle';
import { useWithholdingRate } from '@/features/dividends/useWithholdingRate';
import { formatDate, formatPkr, formatPrice } from '@/utils/formatters';
import {
  summariseExpectedDividends,
  type ExpectedDividendRow,
  type HoldingRef,
} from '@/utils/expectedDividends';
import type { DividendAnnouncement, Portfolio } from '@/types';

function CompanyCell({ row }: { row: ExpectedDividendRow }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="font-mono text-sm font-semibold">{row.symbol}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">{row.companyName}</span>
    </span>
  );
}

/**
 * Announced payouts for one portfolio: amount per share from the feed × shares
 * held, with the net figure at the chosen withholding rate.
 *
 * Sits above the calendar in the portfolio's Dividends tab, so "what is coming"
 * and "when it lands" are one view. The rows are the same maths as the dashboard
 * card — `summariseExpectedDividends` — so the two can never disagree.
 */
export function ExpectedDividendsSection({
  portfolio,
  announcements,
}: {
  portfolio: Portfolio;
  announcements: DividendAnnouncement[];
}) {
  const [rate, setRate] = useWithholdingRate();
  const reduced = useReducedMotion();

  const refs: HoldingRef[] = useMemo(
    () =>
      portfolio.holdings.map((holding) => ({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        holding,
      })),
    [portfolio],
  );

  const summary = useMemo(
    () => summariseExpectedDividends(refs, announcements, rate),
    [refs, announcements, rate],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              Expected dividends
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Announced amount per share × the shares you hold
            </p>
          </div>
          <WithholdingToggle rate={rate} onChange={setRate} />
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {summary.payouts === 0 ? (
          <div className="rounded-xl border border-dashed bg-surface/50 px-4 py-6 text-center">
            <p className="text-sm font-medium">Nothing announced for this portfolio</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {announcements.length === 0
                ? 'The feed has no dividend announcements dated today or later.'
                : `The feed lists ${announcements.length} announcement${announcements.length === 1 ? '' : 's'} dated today or later, none for ${summary.holdingsWithout.slice(0, 5).join(', ')}${summary.holdingsWithout.length > 5 ? ` +${summary.holdingsWithout.length - 5}` : ''}.`}
            </p>
          </div>
        ) : (
          <>
            {/* Headline */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Expected
                </p>
                <p
                  data-testid="portfolio-expected-gross"
                  className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums sm:text-3xl"
                >
                  <AnimatedNumber value={summary.gross} format={formatPkr} duration={0.6} />
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  <span data-testid="portfolio-expected-net" className="font-mono tabular-nums">
                    {formatPkr(summary.net)}
                  </span>{' '}
                  after {rate}% withholding
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-x-5 gap-y-1 text-right">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Payouts</dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums">{summary.payouts}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Next</dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums">
                    {summary.nextDate ? formatDate(summary.nextDate) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Covered</dt>
                  <dd className="font-mono text-sm font-semibold tabular-nums">
                    {summary.holdingsCovered}
                    <span className="text-xs font-normal text-muted-foreground"> / {refs.length}</span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Rows */}
            <table className="mt-4 hidden w-full text-sm md:table">
              <caption className="sr-only">Announced dividends for {portfolio.name}</caption>
              <thead>
                <tr className="border-y text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th scope="col" className="px-1 py-2 text-left font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Announced</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Per share</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Shares</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Gross</th>
                  <th scope="col" className="px-1 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row, index) => (
                  <motion.tr
                    key={row.key}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : Math.min(index, 6) * 0.03 }}
                    className="border-b last:border-0 hover:bg-muted/40"
                  >
                    <td className="w-[34%] px-1 py-2.5">
                      <CompanyCell row={row} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {formatDate(row.announcementDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPrice(row.amountPerShare)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.shares.toLocaleString('en-PK')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {formatPkr(row.gross)}
                    </td>
                    <td className="px-1 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {formatPkr(row.net)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>

            {/* Phone */}
            <ul className="mt-3 divide-y md:hidden">
              {summary.rows.map((row, index) => (
                <motion.li
                  key={row.key}
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : Math.min(index, 6) * 0.03 }}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold">{row.symbol}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {formatDate(row.announcementDate)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatPrice(row.amountPerShare)} × {row.shares.toLocaleString('en-PK')} shares
                      {row.yieldOnCost !== null && <> · {row.yieldOnCost.toFixed(2)}% of cost</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">{formatPkr(row.gross)}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatPkr(row.net)} net
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>

            <p className="mt-3 flex items-start gap-2 border-t pt-3 text-[11px] text-muted-foreground">
              <CalendarClock aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                Dated by announcement, not payment — the feed publishes no pay date. These also mark
                the calendar below.
                {summary.holdingsWithout.length > 0 && (
                  <> No announcement for {summary.holdingsWithout.slice(0, 6).join(', ')}
                    {summary.holdingsWithout.length > 6 ? ` +${summary.holdingsWithout.length - 6}` : ''}.</>
                )}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
