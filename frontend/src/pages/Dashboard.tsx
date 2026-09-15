import { useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, DollarSign, Activity, Award, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricCard, EmptyState } from '@/components/shared';
import { AllocationPieChart, SectorBarChart, KSE100ComparisonChart } from '@/features/charts';
import { useAllPortfoliosMetrics } from '@/hooks';
import { useKSE100, useSectorPerformance } from '@/hooks';
import { usePortfolioStore } from '@/store';
import { ROUTES } from '@/constants';

export function Dashboard() {
  const navigate = useNavigate();
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const { aggregate, isLoading, metricsPerPortfolio } = useAllPortfoliosMetrics();
  const { data: kse100 } = useKSE100();
  const { data: sectorData = [] } = useSectorPerformance();

  if (portfolios.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Activity className="h-8 w-8 text-muted-foreground" />}
          title="No portfolios yet"
          description="Create your first portfolio to start tracking your PSX investments."
          action={
            <Button onClick={() => navigate(ROUTES.PORTFOLIOS)}>
              <Plus className="mr-2 h-4 w-4" /> Create Portfolio
            </Button>
          }
        />
      </div>
    );
  }

  // Build allocation data from all holdings
  const allHoldings = portfolios.flatMap((p) => p.holdings);
  const sectorAlloc = allHoldings.reduce((acc, h) => {
    acc[h.sector] = (acc[h.sector] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(sectorAlloc).map(([sector, count]) => ({
    name: sector.split(' ')[0], // abbreviate
    value: count,
    percent: (count / allHoldings.length) * 100,
  }));

  // KSE100 return (90-day)
  const kse100Return = kse100
    ? ((kse100.value - kse100.historicalData[0]?.close) / (kse100.historicalData[0]?.close || 1)) * 100
    : 0;

  // Best/worst across all portfolios
  const bestPerformer = metricsPerPortfolio
    .flatMap((m) => m.holdingMetrics)
    .reduce((best, m) => (!best || m.unrealizedPLPercent > best.unrealizedPLPercent ? m : best), null as (typeof metricsPerPortfolio[0]['holdingMetrics'][0]) | null);
  const worstPerformer = metricsPerPortfolio
    .flatMap((m) => m.holdingMetrics)
    .reduce((worst, m) => (!worst || m.unrealizedPLPercent < worst.unrealizedPLPercent ? m : worst), null as typeof bestPerformer);
  const bestSymbol = portfolios.flatMap((p) => p.holdings).find((h) => h.id === bestPerformer?.holdingId)?.symbol;
  const worstSymbol = portfolios.flatMap((p) => p.holdings).find((h) => h.id === worstPerformer?.holdingId)?.symbol;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Investment"
          value={aggregate.totalInvestment}
          isCurrency
          compact
          icon={<DollarSign className="h-4 w-4" />}
          isLoading={isLoading}
        />
        <MetricCard
          title="Current Value"
          value={aggregate.currentValue}
          isCurrency
          compact
          change={aggregate.totalPL}
          changePercent={aggregate.totalPLPercent}
          icon={<TrendingUp className="h-4 w-4" />}
          isLoading={isLoading}
        />
        <MetricCard
          title="Today's P&L"
          value={aggregate.todayPL}
          isCurrency
          compact
          changePercent={aggregate.todayPLPercent}
          icon={<Activity className="h-4 w-4" />}
          isLoading={isLoading}
          toneBySign
        />
        <MetricCard
          title="Total Dividends"
          value={aggregate.totalDividendIncome}
          isCurrency
          compact
          subtitle="All-time received"
          icon={<DollarSign className="h-4 w-4" />}
          isLoading={isLoading}
        />
      </div>

      {/* Best / Worst performers */}
      {(bestSymbol || worstSymbol) && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard
            title="Best Performer"
            value={bestSymbol ?? '—'}
            subtitle={bestPerformer ? `${bestPerformer.unrealizedPLPercent >= 0 ? '+' : ''}${bestPerformer.unrealizedPLPercent.toFixed(2)}% return` : undefined}
            icon={<Award className="h-4 w-4 text-profit" />}
            isLoading={isLoading}
          />
          <MetricCard
            title="Worst Performer"
            value={worstSymbol ?? '—'}
            subtitle={worstPerformer ? `${worstPerformer.unrealizedPLPercent.toFixed(2)}% return` : undefined}
            icon={<AlertTriangle className="h-4 w-4 text-loss" />}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pieData.length > 0 && (
          <AllocationPieChart data={pieData} title="Sector Allocation (Holdings)" />
        )}
        {sectorData.length > 0 && (
          <SectorBarChart data={sectorData} title="Market Sector Performance" />
        )}
      </div>

      {/* KSE100 comparison */}
      {kse100 && metricsPerPortfolio.length > 0 && (
        <KSE100ComparisonChart
          portfolioData={kse100.historicalData} // Using KSE as proxy for demo; in real app use portfolio NAV history
          kse100Data={kse100.historicalData}
          portfolioReturnPercent={aggregate.totalReturnPercent}
          kse100ReturnPercent={kse100Return}
        />
      )}
    </div>
  );
}
