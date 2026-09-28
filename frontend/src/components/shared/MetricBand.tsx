import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface BandStat {
  label: string;
  value: string;
  /** Small clarifier under the value ("all-time received", "vs yesterday"). */
  hint?: string;
  tone?: 'neutral' | 'profit' | 'loss';
}

interface MetricBandProps {
  /** What the headline number is ("Current value"). */
  label: string;
  value: string;
  /** The change since purchase, shown beside the headline. */
  change?: { amount?: string; percent?: string; tone: 'neutral' | 'profit' | 'loss' };
  /** Supporting figures, given equal weight and no card of their own. */
  stats: BandStat[];
  /** A caveat that qualifies every figure in the band. */
  notice?: ReactNode;
  isLoading?: boolean;
}

const TONE_CLASS = {
  neutral: 'text-muted-foreground',
  profit: 'text-profit-dark dark:text-profit',
  loss: 'text-loss-dark dark:text-loss',
} as const;

/**
 * The answer-first summary: one headline figure with its change, and the rest of
 * the numbers as supporting rows inside the same surface.
 *
 * It replaces a row of five identical cards, where the value of the portfolio and
 * the number of dividends carried the same visual weight — so the eye had to read
 * all five to find the one that mattered, and at 2xl five tiles squeezed each
 * value onto a second line.
 */
export function MetricBand({ label, value, change, stats, notice, isLoading }: MetricBandProps) {
  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardContent className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-10 w-52" />
            <Skeleton className="mt-3 h-4 w-40" />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-2 h-5 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {/* The one figure on the page that is allowed to be large. */}
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{value}</p>
          {change && (
            <p className={cn('mt-2 flex flex-wrap items-center gap-x-2 text-sm font-medium', TONE_CLASS[change.tone])}>
              {change.amount && <span className="tabular-nums">{change.amount}</span>}
              {change.percent && (
                <span className="tabular-nums">
                  {change.amount ? `(${change.percent})` : change.percent}
                </span>
              )}
              <span className="text-muted-foreground">since purchase</span>
            </p>
          )}
          {notice && <div className="mt-3">{notice}</div>}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{stat.label}</dt>
              <dd
                className={cn(
                  'mt-0.5 truncate text-base font-medium tabular-nums',
                  stat.tone ? TONE_CLASS[stat.tone] : undefined
                )}
              >
                {stat.value}
              </dd>
              {stat.hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{stat.hint}</p>}
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
