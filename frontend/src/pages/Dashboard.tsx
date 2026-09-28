import { useNavigate, Link } from 'react-router-dom';
import { Activity, ArrowUpRight, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, MetricBand, PLValue, PageHeader } from '@/components/shared';
import type { BandStat } from '@/components/shared';
import { AllocationPieChart, SectorBarChart, BenchmarkComparisonChart, rangeConfig } from '@/features/charts';
import type { ComparisonBenchmark, ComparisonRange } from '@/features/charts';
import { useAllPortfoliosMetrics } from '@/hooks';
import { useKSE100, usePortfolioHistory, useSectorPerformance } from '@/hooks';
import { usePortfolioStore } from '@/store';
import { ROUTES, DEFAULT_INDEX_CODE, indexLabel } from '@/constants';
import { formatCurrency, formatPercent } from '@/utils';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/** One row of the movers list. */
interface Mover {
  symbol: string;
  sector: string;
  portfolioId: string;
  portfolioName: string;
  returnPercent: number;
}

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
      <div className="space-y-6">
        {/* The empty screen keeps the page heading. Without it a fresh install had
            no <h1> at all — no page name in the document outline, nothing for a
            screen reader to land on — because this branch returned early. */}
        <PageHeader
          title="Dashboard"
          description="Your holdings, what they are worth, and what the market did today."
        />
        <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
          <EmptyState
            icon={<Activity className="h-7 w-7" />}
            title="No portfolios yet"
            description="A portfolio is where you record what you bought and at what price — every figure in this app is built from them."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => navigate(ROUTES.PORTFOLIOS)}>Create a portfolio</Button>
                <Button variant="ghost" onClick={() => navigate(ROUTES.SETTINGS)}>
                  Restore a backup
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // Build allocation data from all holdings — by sector, under its own name.
  const sectorAlloc = allHoldings.reduce((acc, h) => {
    acc[h.sector] = (acc[h.sector] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(sectorAlloc).map(([sector, count]) => ({
    // The feed's sector name, whole: it was truncated to its first word, so
    // "Commercial Banks" and "Commercial ..." were indistinguishable.
    name: sector,
    value: count,
    percent: (count / allHoldings.length) * 100,
  }));

  // Movers — priced holdings only. An unpriced holding carries a 0% return that
  // means "unknown", and used to be ranked as a real one.
  const holdingById = new Map(allHoldings.map((h) => [h.id, h]));
  const portfolioByHoldingId = new Map(
    portfolios.flatMap((p) => p.holdings.map((h) => [h.id, { id: p.id, name: p.name }] as const)),
  );
  const movers: Mover[] = metricsPerPortfolio
    .flatMap((m) => m.holdingMetrics)
    .filter((m) => m.priceAvailable)
    .flatMap((m) => {
      const holding = holdingById.get(m.holdingId);
      const portfolio = portfolioByHoldingId.get(m.holdingId);
      if (!holding || !portfolio) return [];
      return [{
        symbol: holding.symbol,
        // A holding carries no company name of its own, so the sector is the
        // context a bare ticker needs.
        sector: holding.sector,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        returnPercent: m.unrealizedPLPercent,
      }];
    });

  const gainers = [...movers].sort((a, b) => b.returnPercent - a.returnPercent).filter((m) => m.returnPercent > 0).slice(0, 3);
  // A loser list that shows a flat holding would be noise; "down" means down.
  const losers = [...movers].sort((a, b) => a.returnPercent - b.returnPercent).filter((m) => m.returnPercent < 0).slice(0, 3);

  const unpriced = metricsPerPortfolio.reduce((sum, m) => sum + m.unpricedHoldings, 0);
  const plPercent = aggregate.totalPLPercent;
  const tone = aggregate.totalPL > 0 ? 'profit' : aggregate.totalPL < 0 ? 'loss' : 'neutral';
  const todayTone = aggregate.todayPL > 0 ? 'profit' : aggregate.todayPL < 0 ? 'loss' : 'neutral';

  const stats: BandStat[] = [
    { label: 'Invested', value: formatCurrency(aggregate.totalInvestment) },
    {
      label: "Today's P&L",
      value: formatCurrency(aggregate.todayPL),
      hint: aggregate.todayPLPercent !== undefined ? formatPercent(aggregate.todayPLPercent) : undefined,
      tone: todayTone,
    },
    { label: 'Dividends', value: formatCurrency(aggregate.totalDividendIncome), hint: 'All-time received' },
    { label: 'Holdings', value: String(allHoldings.length), hint: `${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'} · ${allHoldings.length} holdings, valued from live PSX prices`}
        actions={
          <Button variant="outline" onClick={() => navigate(ROUTES.PORTFOLIOS)}>
            Manage portfolios
          </Button>
        }
      />

      {/* Answer first: what it is worth and how it is doing. */}
      <MetricBand
        label="Current value"
        value={formatCurrency(aggregate.currentValue)}
        change={{
          amount: formatCurrency(aggregate.totalPL),
          percent: plPercent !== undefined ? formatPercent(plPercent) : undefined,
          tone,
        }}
        stats={stats}
        isLoading={isLoading}
        notice={
          unpriced > 0 ? (
            <p className="flex items-start gap-2 text-xs text-warning-dark dark:text-warning">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {unpriced} holding{unpriced === 1 ? '' : 's'} could not be priced by the feed and
                {unpriced === 1 ? ' is' : ' are'} excluded from these figures.
              </span>
            </p>
          ) : undefined
        }
      />

      {/* Movers: which holdings are carrying the return, and which are dragging it. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: 'Top gainers', rows: gainers, empty: 'Nothing is showing an unrealised gain.' },
          { title: 'Top losers', rows: losers, empty: 'Nothing is showing an unrealised loss.' },
        ].map((column) => (
          <Card key={column.title}>
            <CardHeader className="pb-2">
              <CardTitle>{column.title}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              {column.rows.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">{column.empty}</p>
              ) : (
                <ul className="divide-y">
                  {column.rows.map((m) => (
                    <li key={`${m.portfolioId}-${m.symbol}`}>
                      <Link
                        to={ROUTES.STOCK_DETAIL_PATH(m.portfolioId, m.symbol)}
                        className="flex min-h-11 items-center gap-3 rounded-md py-2 transition-colors duration-base ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1">
                          {/* Symbol and sector, so the row is not a bare ticker. */}
                          <span className="flex items-baseline gap-2">
                            <span className="font-mono text-sm font-semibold">{m.symbol}</span>
                            <span className="truncate text-xs text-muted-foreground">{m.sector}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {m.portfolioName}
                          </span>
                        </span>
                        <PLValue value={m.returnPercent} />
                        <ArrowUpRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Holdings composition and the market's own sector performance, side by side:
          one is "where my money is", the other is "what the market did" — but only
          when both exist. With one, it takes the full width instead of leaving a
          dead column beside it. */}
      {(pieData.length > 0 || sectorData.length > 0) && (
        <div className={cn('grid gap-4', pieData.length > 0 && sectorData.length > 0 && 'lg:grid-cols-2')}>
          {pieData.length > 0 && (
            <AllocationPieChart data={pieData} title="Where your money is" />
          )}
          {sectorData.length > 0 && (
            <SectorBarChart data={sectorData} title="Sector performance (market)" />
          )}
        </div>
      )}

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
