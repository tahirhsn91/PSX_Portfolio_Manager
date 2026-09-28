import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '@/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  changePercent?: number;
  isCurrency?: boolean;
  isPercent?: boolean;
  icon?: ReactNode;
  isLoading?: boolean;
  className?: string;
  compact?: boolean;
  /**
   * Mark the tile by the sign of `change` (or of `value` when no `change` is
   * given). The *surface* stays neutral and the sign is carried by a left accent
   * rule plus a tinted icon chip: tinting the whole card meant two of five tiles
   * were washed pink in a losing portfolio and read as errors rather than data.
   */
  toneBySign?: boolean;
}

/** The ink and accent for a profit / loss / flat reading. */
function signTone(reading: number) {
  if (reading > 0) {
    return {
      accent: 'before:bg-profit',
      chip: 'bg-profit-light text-profit-dark',
      ink: 'text-profit-dark dark:text-profit',
    };
  }
  if (reading < 0) {
    return {
      accent: 'before:bg-loss',
      chip: 'bg-loss-light text-loss-dark',
      ink: 'text-loss-dark dark:text-loss',
    };
  }
  return { accent: '', chip: 'bg-muted text-muted-foreground', ink: 'text-muted-foreground' };
}

export function MetricCard({
  title,
  value,
  subtitle,
  change,
  changePercent,
  isCurrency,
  isPercent,
  icon,
  isLoading,
  className,
  compact,
  toneBySign,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <Card className={className} aria-busy="true">
        <CardContent className="p-5">
          <Skeleton className="mb-3 h-4 w-24" />
          <Skeleton className="mb-2 h-8 w-32" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  const displayValue = typeof value === 'number'
    ? isCurrency
      ? formatCurrency(value, compact)
      : isPercent
      ? formatPercent(value)
      : value.toLocaleString()
    : value;

  // The reading this tile is about: the amount moved when one was passed, else the
  // percentage, else the value itself. A card stating "+30.99%" must not show the
  // neutral "no change" icon merely because only a percentage was passed.
  const reading = change ?? changePercent ?? (typeof value === 'number' ? value : 0);
  const trend = reading > 0 ? 'up' : reading < 0 ? 'down' : 'neutral';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const tone = toneBySign ? signTone(reading) : null;

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-shadow duration-base ease-standard hover:shadow-raised',
        'animate-fade-in',
        // A 4px sign rule down the leading edge, so the reading is visible before
        // the number is read.
        tone?.accent && ['before:absolute before:inset-y-0 before:left-0 before:w-1', tone.accent],
        className
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          {icon && (
            <div
              aria-hidden="true"
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                tone?.chip ?? 'bg-muted text-muted-foreground'
              )}
            >
              {icon}
            </div>
          )}
        </div>
        <div className="mt-2">
          {/*
            text-xl below `sm`: "PKR 60.0K" at text-2xl is 135px, more than a 2-up
            tile leaves at 360px, so the value wrapped to two lines. tabular-nums
            keeps the decimals of a column of figures aligned.
          */}
          <p
            className={cn(
              'text-xl font-semibold tabular-nums tracking-tight sm:text-2xl',
              tone?.ink ?? 'text-foreground'
            )}
          >
            {displayValue}
          </p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {(change !== undefined || changePercent !== undefined) && (
          <div className={cn('mt-3 flex items-center gap-1 text-sm font-medium', tone?.ink ?? 'text-muted-foreground')}>
            <TrendIcon aria-hidden="true" className="h-4 w-4" />
            <span className="tabular-nums">
              {change !== undefined && isCurrency && formatCurrency(Math.abs(change))}
              {changePercent !== undefined && ` (${formatPercent(changePercent)})`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
