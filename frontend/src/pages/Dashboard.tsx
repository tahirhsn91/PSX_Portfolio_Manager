import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, Activity, DollarSign, Award, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetricCard, EmptyState } from '@/components/shared';
import { AllocationPieChart, SectorBarChart, BenchmarkComparisonChart, rangeConfig } from '@/features/charts';
import type { ComparisonBenchmark, ComparisonRange } from '@/features/charts';
import { useAllPortfoliosMetrics } from '@/hooks';
import { useKSE100, usePortfolioHistory, useSectorPerformance } from '@/hooks';
import { usePortfolioStore } from '@/store';
import { ROUTES, DEFAULT_INDEX_CODE, indexLabel } from '@/constants';

export function Dashboard() {
  const navigate = useNavigate();
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const { aggregate, isLoading, metricsPerPortfolio } = useAllPortfoliosMetrics();
  const { data: kse100, isLoading: kseLoading } = useKSE100();
  const { data: sectorData = [] } = useSectorPerformance();
  const [range, setRange] = useState<ComparisonRange>('3M');

  // The portfolio side of the "vs benchmark" comparison, priced from real history.
  const allHoldings = portfolios.flatMap((p) => p.holdings);
  const { series: portfolioSeries, isLoading: portfolioHistoryLoading } = usePortfolioHistory(
    allHoldings, rangeConfig(range).days,
  );

  // The dashboard aggregates every portfolio, so its benchmark is the index.
  const benchmark: ComparisonBenchmark = {
    id: 'KSE100',
    label: indexLabel(DEFAULT_INDEX_CODE),
    series: kse100?.historicalData ?? [],
    kind: 'index',
  };

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
  const sectorAlloc = allHoldings.reduce((acc, h) => {
    acc[h.sector] = (acc[h.sector] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(sectorAlloc).map(([sector, count]) => ({
    name: sector.split(' ')[0], // abbreviate
    value: count,
    percent: (count / allHoldings.length) * 100,
  }));

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

      {/* Benchmark comparison — the portfolio's own line, priced from its holdings */}
      {metricsPerPortfolio.length > 0 && (
        <BenchmarkComparisonChart
          title={portfolios.length === 1
            ? `${portfolios[0].name} vs ${benchmark.label}`
            : `All portfolios vs ${benchmark.label}`}
          portfolioLabel={portfolios.length === 1 ? portfolios[0].name : 'Portfolio'}
          portfolioData={portfolioSeries}
          benchmark={benchmark}
          range={range}
          onRangeChange={setRange}
          portfolioLoading={portfolioHistoryLoading}
          benchmarkLoading={kseLoading}
        />
      )}
    </div>
  );
}
