import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/utils';

interface PLBadgeProps {
  value: number;
  showIcon?: boolean;
  suffix?: string;
}

export function PLBadge({ value, showIcon = true, suffix }: PLBadgeProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const variant = isPositive ? 'profit' : isNegative ? 'loss' : 'neutral';
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <Badge variant={variant} className="gap-1">
      {showIcon && <Icon className="h-3 w-3" />}
      {formatPercent(value)}
      {suffix && ` ${suffix}`}
    </Badge>
  );
}
