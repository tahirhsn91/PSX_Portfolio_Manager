import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, getPLColorClass } from '@/utils';

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
   * Tint the card and its value by the sign of `change` (or of `value` when no
   * `change` is given): light green when up, light red when down. For P&L
   * metrics, so a loss reads at a glance without hunting for the sign.
   */
  toneBySign?: boolean;
}

/** Card + value styling for a profit / loss / flat reading. */
function signTone(reading: number) {
  if (reading > 0) {
    return {
      // Light green in light mode; on a dark page a pale fill would glare, so
      // the same hue is used at low opacity instead.
      card: 'bg-profit-light/60 border-profit/30 dark:bg-profit/15 dark:border-profit/40',
      value: 'text-profit-dark dark:text-profit',
    };
  }
  if (reading < 0) {
    return {
      card: 'bg-loss-light/60 border-loss/30 dark:bg-loss/15 dark:border-loss/40',
      value: 'text-loss-dark dark:text-loss',
    };
  }
  return { card: '', value: '' };
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
      <Card className={className}>
        <CardContent className="p-6">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-32 mb-2" />
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

  const trend = (change ?? 0) > 0 ? 'up' : (change ?? 0) < 0 ? 'down' : 'neutral';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  // `change` is the amount moved; fall back to `value` for cards that only pass
  // a P&L figure (Today's P&L passes changePercent, not change).
  const reading = change ?? (typeof value === 'number' ? value : 0);
  const tone = toneBySign ? signTone(reading) : { card: '', value: '' };

  return (
    <Card className={cn('transition-all hover:shadow-md animate-fade-in', tone.card, className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <div className="mt-2">
          <p className={cn('text-2xl font-bold tracking-tight', tone.value)}>{displayValue}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {(change !== undefined || changePercent !== undefined) && (
          <div className={cn('mt-3 flex items-center gap-1 text-sm font-medium', getPLColorClass(change ?? 0))}>
            <TrendIcon className="h-4 w-4" />
            <span>
              {change !== undefined && isCurrency && formatCurrency(Math.abs(change))}
              {changePercent !== undefined && ` (${formatPercent(changePercent)})`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
