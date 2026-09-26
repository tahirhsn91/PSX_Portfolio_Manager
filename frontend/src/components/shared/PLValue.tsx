import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercent } from '@/utils';

interface PLValueProps {
  value: number;
  showIcon?: boolean;
  suffix?: string;
  className?: string;
}

/**
 * A profit/loss figure as plain text — the value, its sign and its tone.
 *
 * It used to be a badge: a pill with a tinted background, a border and a
 * `9999px` radius, which drew a box around every row of a table column of
 * numbers. Everything else about it is unchanged.
 *
 * The tone is the pair `MetricCard` uses for the same figure, so the ink
 * matches the KPI tiles in both themes — and it has to be theme-aware: this
 * text sits on the page/card background, where `#22c55e` on white is 1.9:1 but
 * `#15803d` on white is 4.6:1, and the reverse in dark mode.
 */
export function PLValue({ value, showIcon = true, suffix, className }: PLValueProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const tone = isPositive
    ? 'text-profit-dark dark:text-profit'
    : isNegative
      ? 'text-loss-dark dark:text-loss'
      : 'text-muted-foreground';

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', tone, className)}>
      {showIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {formatPercent(value)}
      {suffix && ` ${suffix}`}
    </span>
  );
}
