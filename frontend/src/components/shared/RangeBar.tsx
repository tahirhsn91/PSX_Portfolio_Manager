import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface RangeBarProps {
  /** Bottom of the range (e.g. 52-week low). */
  low: number;
  /** Top of the range (e.g. 52-week high). */
  high: number;
  /** Where the marker sits — usually the current price. */
  current: number;
  label?: string;
  lowCaption?: string;
  highCaption?: string;
  isLoading?: boolean;
  className?: string;
}

/** Fraction of the way from `low` to `high`, clamped to 0–100 (%). */
export function rangePosition(low: number, high: number, current: number): number {
  const span = high - low;
  if (!Number.isFinite(span) || span <= 0) return 50;
  const pct = ((current - low) / span) * 100;
  if (!Number.isFinite(pct)) return 50;
  return Math.min(100, Math.max(0, pct));
}

/**
 * Horizontal low→high range strip with a marker at `current`.
 *
 * Replaces the pair of "52W High" / "52W Low" number boxes with one glanceable
 * bar: the low sits at the left end, the high at the right, and the dot shows
 * where the price currently is between them.
 */
export function RangeBar({
  low,
  high,
  current,
  label = '52-Week Range',
  lowCaption = '52W Low',
  highCaption = '52W High',
  isLoading,
  className,
}: RangeBarProps) {
  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-6 shadow-sm', className)}>
        <Skeleton className="mb-3 h-4 w-28" />
        <Skeleton className="h-2 w-full" />
        <div className="mt-3 flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    );
  }

  // Guard against providers that report no range (untracked symbol, no history,
  // zero-filled placeholders) so the bar never claims a position it doesn't have.
  const hasRange =
    Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0 && high >= low;
  const hasCurrent = Number.isFinite(current) && current > 0;
  const position = hasRange && hasCurrent ? rangePosition(low, high, current) : 50;
  const outOfRange = hasRange && hasCurrent && (current < low || current > high);

  return (
    <div className={cn('rounded-lg border bg-card p-6 text-card-foreground shadow-sm', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {hasRange && hasCurrent && (
          <p className="text-sm font-medium" title="Current price">
            Now <span className="font-semibold">{formatCurrency(current)}</span>
          </p>
        )}
      </div>

      {hasRange && hasCurrent ? (
        <>
          <div
            className="relative mt-4 h-2 rounded-full bg-muted"
            role="img"
            aria-label={`${label}: ${lowCaption} ${formatCurrency(low)}, ${highCaption} ${formatCurrency(high)}, current ${formatCurrency(current)}`}
          >
            {/* progress up to the marker */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
              style={{ width: `${position}%` }}
            />
            {/* the marker: sits on the track, centred on its position */}
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-sm transition-[left] duration-500 ease-out"
              style={{ left: `${position}%` }}
              title={`${formatCurrency(current)} — ${position.toFixed(0)}% of range`}
            />
          </div>

          <div className="mt-3 flex justify-between text-xs">
            <div>
              <p className="text-muted-foreground">{lowCaption}</p>
              <p className="font-semibold">{formatCurrency(low)}</p>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground">{highCaption}</p>
              <p className="font-semibold">{formatCurrency(high)}</p>
            </div>
          </div>

          {outOfRange && (
            <p className="mt-2 text-xs text-muted-foreground">
              Today's price is {current > high ? 'above' : 'below'} the 52-week range.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">52-week range unavailable for this symbol.</p>
      )}
    </div>
  );
}
