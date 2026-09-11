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

  return (
    <Card className={cn('transition-all hover:shadow-md animate-fade-in', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <div className="mt-2">
          <p className="text-2xl font-bold tracking-tight">{displayValue}</p>
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
