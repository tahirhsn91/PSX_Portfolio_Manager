import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, TrendingUp, DollarSign, Activity, Award, AlertTriangle, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { MetricCard, EmptyState, CompanySearch } from '@/components/shared';
import { HoldingsTable } from '@/features/portfolio/HoldingsTable';
import { HoldingForm } from '@/features/portfolio/HoldingForm';
import { AllocationPieChart, PortfolioValueChart, BenchmarkComparisonChart, rangeConfig } from '@/features/charts';
import type { ComparisonBenchmark, ComparisonRange } from '@/features/charts';
import { usePortfolioStore, useUIStore } from '@/store';
import { usePortfolioMetrics, useKSE100, useIndex, usePortfolioHistory, useCandles } from '@/hooks';
import { buildSectorAllocation } from '@/utils';
import { ROUTES, PSX_INDICES, DEFAULT_INDEX_CODE, indexLabel } from '@/constants';
import { format, subDays, addDays } from 'date-fns';
import type { Holding, PSXCompany } from '@/types';
import type { HoldingFormValues } from '@/utils';

/**
 * Every PSX index, offered in the picker as a pseudo-company so indices and stocks
 * are chosen from the same field. All 18 are listed — that is PSX's full set — and
 * the ones the feed does not track render "not tracked yet" rather than a blank chart.
 */
const INDEX_OPTIONS: PSXCompany[] = PSX_INDICES.map((index) => ({
  symbol: index.code,
  name: index.label,
  sector: 'Index',
  marketCap: 0,
  listedShares: 0,
}));

/** What the comparison plots the portfolio against. */
interface Benchmark {
  kind: 'index' | 'stock';
  code: string;
  label: string;
}

const DEFAULT_BENCHMARK: Benchmark = {
  kind: 'index',
  code: DEFAULT_INDEX_CODE,
  label: indexLabel(DEFAULT_INDEX_CODE),
};

/** The picker hands back a company-shaped option; a known index code means an index. */
function toBenchmark(company: PSXCompany): Benchmark {
  return PSX_INDICES.some((index) => index.code === company.symbol)
    ? { kind: 'index', code: company.symbol, label: indexLabel(company.symbol) }
    : { kind: 'stock', code: company.symbol, label: company.symbol };
}

export function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === id));
  const { addHolding, updateHolding, deleteHolding } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const { metrics, isLoading } = usePortfolioMetrics(id);
  const [range, setRange] = useState<ComparisonRange>('3M');
  // What to compare against: a PSX index code, or any listed stock's symbol.
  const [benchmark, setBenchmark] = useState<Benchmark>(DEFAULT_BENCHMARK);
  // The Value tab still charts the index as a stand-in for portfolio value (pre-existing
  // behaviour, untouched here) — the comparison below uses the benchmark instead.
  const { data: kse100 } = useKSE100();

  const rangeDays = rangeConfig(range).days;
  const { series: portfolioSeries, isLoading: portfolioHistoryLoading } = usePortfolioHistory(
    portfolio?.holdings, rangeDays,
  );

  // Whichever the benchmark is, fetch its own series for the selected period from the
  // feed's candles. The feed treats `to` as exclusive, so the window runs to tomorrow.
  const indexQuery = useIndex(benchmark.kind === 'index' ? benchmark.code : undefined);
  const { data: benchmarkStockHistory = [], isLoading: benchmarkStockLoading } = useCandles(
    benchmark.kind === 'stock' ? benchmark.code : undefined,
    {
      from: format(subDays(new Date(), rangeDays), 'yyyy-MM-dd'),
      to: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    },
  );

  const comparisonBenchmark: ComparisonBenchmark = {
    id: benchmark.code,
    label: benchmark.label,
    kind: benchmark.kind,
    series: benchmark.kind === 'index' ? (indexQuery.data?.historicalData ?? []) : benchmarkStockHistory,
  };

  const [addOpen, setAddOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);

  if (!portfolio || !id) {
    return (
      <div className="flex h-64 items-center justify-center">
        <EmptyState title="Portfolio not found" description="This portfolio may have been deleted." />
      </div>
    );
  }

  const handleAdd = (values: HoldingFormValues) => {
    addHolding({ portfolioId: id, ...values });
    addNotification({ type: 'success', title: `${values.symbol} added to portfolio` });
    setAddOpen(false);
  };

  const handleUpdate = (values: HoldingFormValues) => {
    if (!editingHolding) return;
    updateHolding(id, { id: editingHolding.id, ...values });
    addNotification({ type: 'success', title: 'Holding updated' });
    setEditingHolding(null);
  };

  const handleDelete = (holdingId: string) => {
    const h = portfolio.holdings.find((h) => h.id === holdingId);
    if (!h) return;
    if (!window.confirm(`Remove ${h.symbol} from this portfolio?`)) return;
    deleteHolding(id, holdingId);
    addNotification({ type: 'info', title: `${h.symbol} removed` });
  };

  const sectorAlloc = buildSectorAllocation(portfolio, metrics?.holdingMetrics ?? []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(ROUTES.PORTFOLIOS)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: portfolio.color }} />
            <h2 className="text-2xl font-bold">{portfolio.name}</h2>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Holding
        </Button>
      </div>

      {/* KPI Cards — five tiles, so the same two/three/five ramp as the Dashboard:
          a row of five only from 2xl, where each tile still fits its value on one line. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        <MetricCard title="Invested" value={metrics?.totalInvestment ?? 0} isCurrency compact icon={<DollarSign className="h-4 w-4" />} isLoading={isLoading} />
        <MetricCard title="Current Value" value={metrics?.currentValue ?? 0} isCurrency compact change={metrics?.totalPL} changePercent={metrics?.totalPLPercent} icon={<TrendingUp className="h-4 w-4" />} isLoading={isLoading} />
        <MetricCard title="Total P&L" value={metrics?.totalPL ?? 0} isCurrency compact changePercent={metrics?.totalPLPercent} icon={<LineChart className="h-4 w-4" />} isLoading={isLoading} toneBySign />
        <MetricCard title="Today's P&L" value={metrics?.todayPL ?? 0} isCurrency compact changePercent={metrics?.todayPLPercent} icon={<Activity className="h-4 w-4" />} isLoading={isLoading} toneBySign />
        <MetricCard title="Dividends" value={metrics?.totalDividendIncome ?? 0} isCurrency compact subtitle="Total received" icon={<DollarSign className="h-4 w-4" />} isLoading={isLoading} />
      </div>

      {/* Best/Worst */}
      {metrics?.bestPerformer && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard title="Best Performer" value={metrics.bestPerformer.symbol} subtitle={`${metrics.bestPerformer.returnPercent >= 0 ? '+' : ''}${metrics.bestPerformer.returnPercent.toFixed(2)}%`} icon={<Award className="h-4 w-4 text-profit" />} />
          {metrics.worstPerformer && (
            <MetricCard title="Worst Performer" value={metrics.worstPerformer.symbol} subtitle={`${metrics.worstPerformer.returnPercent.toFixed(2)}%`} icon={<AlertTriangle className="h-4 w-4 text-loss" />} />
          )}
        </div>
      )}

      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
          <TabsTrigger
            value="comparison"
            className="max-w-[20rem]"
            title={`${portfolio.name} vs ${benchmark.label}`}
          >
            {/* The portfolio's own name leads, so it's clear which portfolio is
                being compared; long names truncate rather than stretching the tab
                strip, and the benchmark always stays visible. */}
            <span className="truncate">{portfolio.name}</span>
            <span className="ml-1 shrink-0">vs {benchmark.label}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="mt-4">
          {portfolio.holdings.length === 0 ? (
            <EmptyState
              title="No holdings yet"
              description="Add your first stock to start tracking."
              action={<Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Holding</Button>}
            />
          ) : (
            <HoldingsTable
              holdings={portfolio.holdings}
              metrics={metrics?.holdingMetrics ?? []}
              portfolioId={id}
              isLoading={isLoading}
              onEdit={setEditingHolding}
              onDelete={handleDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sectorAlloc.length > 0 && (
              <AllocationPieChart
                data={sectorAlloc.map((s) => ({ name: s.sector, value: s.value, percent: s.percent, color: s.color }))}
                title="Sector Allocation"
              />
            )}
            {kse100 && (
              <PortfolioValueChart
                historicalData={kse100.historicalData}
                totalShares={portfolio.holdings.reduce((s, h) => s + h.shares, 0)}
                title="Portfolio Value (Proxy)"
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="comparison" className="mt-4">
          {/* Rendered unconditionally so the section always names the portfolio;
              the chart itself owns the "no data" states. */}
          <BenchmarkComparisonChart
            title={`${portfolio.name} vs ${benchmark.label}`}
            portfolioLabel={portfolio.name}
            portfolioData={portfolioSeries}
            benchmark={comparisonBenchmark}
            range={range}
            onRangeChange={setRange}
            portfolioLoading={portfolioHistoryLoading}
            benchmarkLoading={benchmark.kind === 'index' ? indexQuery.isLoading : benchmarkStockLoading}
            benchmarkSelector={
              <CompanySearch
                className="w-60"
                placeholder="Compare with an index or stock…"
                extraOptions={INDEX_OPTIONS}
                onSelect={(company) => setBenchmark(toBenchmark(company))}
              />
            }
          />
        </TabsContent>
      </Tabs>

      {/* Add holding dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Add Holding</DialogTitle></DialogHeader>
          <HoldingForm onSubmit={handleAdd} onCancel={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit holding dialog */}
      <Dialog open={!!editingHolding} onOpenChange={(o) => !o && setEditingHolding(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit Holding</DialogTitle></DialogHeader>
          {editingHolding && (
            <HoldingForm
              defaultValues={editingHolding}
              onSubmit={handleUpdate}
              onCancel={() => setEditingHolding(null)}
              isEditing
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
