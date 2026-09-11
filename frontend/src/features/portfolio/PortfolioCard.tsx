import { useNavigate } from 'react-router-dom';
import { MoreVertical, Copy, Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, formatPercent } from '@/utils';
import { ROUTES } from '@/constants';
import type { Portfolio, PortfolioMetrics } from '@/types';
import { cn } from '@/lib/utils';

interface PortfolioCardProps {
  portfolio: Portfolio;
  metrics: PortfolioMetrics | null;
  isLoading?: boolean;
  onEdit: (portfolio: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function PortfolioCard({
  portfolio, metrics, isLoading, onEdit, onDelete, onDuplicate,
}: PortfolioCardProps) {
  const navigate = useNavigate();
  const isProfit = (metrics?.totalPLPercent ?? 0) >= 0;

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 animate-fade-in"
      onClick={() => navigate(ROUTES.PORTFOLIO_DETAIL_PATH(portfolio.id))}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: portfolio.color }}
            />
            <div>
              <h3 className="font-semibold leading-tight">{portfolio.name}</h3>
              {portfolio.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{portfolio.description}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(portfolio)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(portfolio.id)}>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(portfolio.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(metrics?.currentValue ?? 0, true)}
              </p>
              <p className="text-sm text-muted-foreground">
                Invested: {formatCurrency(metrics?.totalInvestment ?? 0, true)}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className={cn('flex items-center gap-1 text-sm font-medium', isProfit ? 'text-profit' : 'text-loss')}>
                {isProfit ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                <span>{formatPercent(metrics?.totalPLPercent ?? 0)}</span>
                <span className="text-muted-foreground font-normal">total</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {portfolio.holdings.length} holding{portfolio.holdings.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {/* Today's P&L */}
            <div className="rounded-md bg-muted/50 p-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Today</span>
              <span className={cn('font-medium', (metrics?.todayPL ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>
                {formatCurrency(metrics?.todayPL ?? 0)} ({formatPercent(metrics?.todayPLPercent ?? 0)})
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
