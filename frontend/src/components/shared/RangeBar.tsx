import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface RangeBarProps {
  /** Bottom of the range (e.g. 52-week low, or the session's low). */
  low: number;
  /** Top of the range. */
  high: number;
  /** Where the marker sits — usually the current price. */
  current: number;
  label?: string;
  lowCaption?: string;
  highCaption?: string;
  /**
   * `exchange` = the feed's own day high/low. `observed` = derived from the
   * prices recorded so far, so it's labelled as such rather than passed off as
   * the official figure.
   */
  source?: 'exchange' | 'observed';
  /** Extra pill in the header, e.g. the date of the session a stale range belongs to. */
  badge?: string;
  badgeTitle?: string;
  /** Copy for the empty state; falls back to a generic line. */
  unavailableMessage?: string;
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
 * Replaces pairs of "High"/"Low" number boxes with one glanceable bar: the low
 * sits at the left end, the high at the right, and the dot shows where the
 * price currently is between them.
 */
export function RangeBar({
  low,
  high,
  current,
  label = '52-Week Range',
  lowCaption = '52W Low',
  highCaption = '52W High',
  source,
  badge,
  badgeTitle,
  unavailableMessage,
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
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {label}
          {hasRange && hasCurrent && source === 'observed' && (
            <span
              className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              title="Derived from the prices recorded so far this session — the feed has no exact day high/low yet."
            >
              recorded
            </span>
          )}
          {hasRange && hasCurrent && badge && (
            <span
              className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              title={badgeTitle}
            >
              {badge}
            </span>
          )}
        </p>
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
              Today's price is {current > high ? 'above' : 'below'} the range.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {/* A blank message must not win over the fallback: `'' ?? x` is `''`,
              which would render an empty tile when the range is known but the
              current price is missing. */}
          {unavailableMessage?.trim() ? unavailableMessage : 'Range unavailable for this symbol.'}
        </p>
      )}
    </div>
  );
}
