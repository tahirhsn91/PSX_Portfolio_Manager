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
import { usePortfolioMetrics, useIndex, usePortfolioHistory, useCandles } from '@/hooks';
import { buildSectorAllocation, buildHoldingAllocation } from '@/utils';
import { ROUTES, PSX_INDICES, DEFAULT_INDEX_CODE, indexLabel } from '@/constants';
import { format, subDays, addDays } from 'date-fns';
import type { Holding, PSXCompany } from '@/types';
import { formatCurrency, type HoldingFormValues, type BuyFormValues } from '@/utils';

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

/** Which breakdown the single allocation card is showing. */
type AllocationView = 'holdings' | 'sector';

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
  const { addHolding, updateHolding, buyInto, updateBuy, deleteHolding } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const { metrics, isLoading } = usePortfolioMetrics(id);
  const [range, setRange] = useState<ComparisonRange>('3M');
  // The allocation card shows one breakdown at a time; Holdings is the default.
  const [allocationView, setAllocationView] = useState<AllocationView>('holdings');
  // What to compare against: a PSX index code, or any listed stock's symbol.
  const [benchmark, setBenchmark] = useState<Benchmark>(DEFAULT_BENCHMARK);
  // The Value tab charts the portfolio's own priced series — the same one the
  // comparison rebases — so the two tabs cannot disagree about what it is worth.

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

  /**
   * The holding the edit dialog is open on, read back from the store rather
   * than from the snapshot that opened it: correcting a trade re-derives the
   * position, and the dialog has to show that new position immediately.
   */
  const liveEditingHolding = editingHolding
    ? portfolio.holdings.find((h) => h.id === editingHolding.id) ?? editingHolding
    : null;

  const handleAdd = (values: HoldingFormValues) => {
    addHolding({ portfolioId: id, ...values });
    addNotification({ type: 'success', title: `${values.symbol} added to portfolio` });
    setAddOpen(false);
  };

  /**
   * Correcting a logged purchase: the store re-derives the position's quantity
   * and average from the whole log. The dialog stays open — the history it
   * shows has just changed — and the notification reports the new position.
   */
  const handleUpdateBuy = (buyId: string, patch: { shares: number; pricePerShare: number }) => {
    if (!editingHolding) return;
    const updated = updateBuy(id, editingHolding.id, buyId, patch);
    if (!updated) return;
    addNotification({
      type: 'success',
      title: 'Purchase updated',
      message: `${updated.symbol} is now ${updated.shares.toLocaleString()} shares at ${formatCurrency(updated.averagePurchasePrice)} average.`,
    });
  };

  const handleUpdate = (values: HoldingFormValues) => {
    if (!editingHolding) return;
    updateHolding(id, { id: editingHolding.id, ...values });
    addNotification({ type: 'success', title: 'Holding updated' });
    setEditingHolding(null);
  };

  /**
   * A second purchase of a stock already held. The store blends the quantity
   * and the weighted average and appends the purchase to the holding's log; all
   * this has to do is report what changed.
   */
  const handleBuy = (values: BuyFormValues) => {
    if (!editingHolding) return;
    const before = `${editingHolding.shares.toLocaleString()} @ ${formatCurrency(editingHolding.averagePurchasePrice)}`;
    const updated = buyInto(id, {
      holdingId: editingHolding.id,
      shares: values.shares,
      pricePerShare: values.pricePerShare,
      date: values.date,
    });
    if (!updated) return;
    addNotification({
      type: 'success',
      title: `Bought ${values.shares.toLocaleString()} ${updated.symbol}`,
      message: `Now ${updated.shares.toLocaleString()} shares at ${formatCurrency(updated.averagePurchasePrice)} average (was ${before}).`,
    });
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
  const holdingAlloc = buildHoldingAllocation(portfolio, metrics?.holdingMetrics ?? []);

  // One card, two breakdowns: whichever the switch has selected is the pie that
  // is mounted, so the row spends a single slot on the question either way.
  const allocationData = allocationView === 'holdings'
    ? holdingAlloc.map((h) => ({ name: h.name, value: h.value, percent: h.percent, color: h.color }))
    : sectorAlloc.map((s) => ({ name: s.sector, value: s.value, percent: s.percent, color: s.color }));
  const allocationTitle = allocationView === 'holdings' ? 'Holdings Allocation' : 'Sector Allocation';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* shrink-0: the name beside it used to squeeze this to 26px wide. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 sm:h-10 sm:w-10"
            aria-label="Back to portfolios"
            onClick={() => navigate(ROUTES.PORTFOLIOS)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: portfolio.color }} />
            <h2 className="truncate text-xl font-bold sm:text-2xl">{portfolio.name}</h2>
          </div>
        </div>
        <Button className="h-11 shrink-0 sm:h-10" onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Holding
        </Button>
      </div>

      {/* A holding the feed can't price is left out of every figure below — say so,
          rather than letting a total quietly mean "the holdings we could price". */}
      {metrics && metrics.unpricedHoldings > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p>
            <span className="font-medium">
              {metrics.unpricedHoldings} of {portfolio.holdings.length} holdings have no price
            </span>{' '}
            ({metrics.unpricedSymbols.join(', ')}) — the figures below cover the other{' '}
            {portfolio.holdings.length - metrics.unpricedHoldings}.
          </p>
        </div>
      )}

      {/* KPI Cards — five tiles, so the same two/three/five ramp as the Dashboard:
          a row of five only from 2xl, where each tile still fits its value on one line. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        <MetricCard title="Invested" value={metrics?.totalInvestment ?? 0} isCurrency icon={<DollarSign className="h-4 w-4" />} isLoading={isLoading} />
        <MetricCard title="Current Value" value={metrics?.currentValue ?? 0} isCurrency change={metrics?.totalPL} changePercent={metrics?.totalPLPercent} icon={<TrendingUp className="h-4 w-4" />} isLoading={isLoading} />
        <MetricCard title="Total P&L" value={metrics?.totalPL ?? 0} isCurrency changePercent={metrics?.totalPLPercent} icon={<LineChart className="h-4 w-4" />} isLoading={isLoading} toneBySign />
        <MetricCard title="Today's P&L" value={metrics?.todayPL ?? 0} isCurrency changePercent={metrics?.todayPLPercent} icon={<Activity className="h-4 w-4" />} isLoading={isLoading} toneBySign />
        <MetricCard title="Dividends" value={metrics?.totalDividendIncome ?? 0} isCurrency subtitle="Total received" icon={<DollarSign className="h-4 w-4" />} isLoading={isLoading} />
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
            {/* A single allocation slot: the switch in the card header decides whether
                the pie breaks the portfolio down by holding or by sector, so the row
                never spends two cards on the same question. */}
            {allocationData.length > 0 && (
              <AllocationPieChart
                data={allocationData}
                title={allocationTitle}
                headerExtra={
                  <Tabs
                    value={allocationView}
                    onValueChange={(value) => setAllocationView(value as AllocationView)}
                  >
                    {/* Segmented (see TabsList): a bordered track whose selected half is a
                        solid fill, so the switch reads the same way as the comparison-period
                        control beside it. */}
                    <TabsList variant="segmented">
                      <TabsTrigger value="holdings">Holdings</TabsTrigger>
                      <TabsTrigger value="sector">Sector</TabsTrigger>
                    </TabsList>
                  </Tabs>
                }
              />
            )}
            <PortfolioValueChart series={portfolioSeries} title="Portfolio Value" rangeDays={rangeDays} />
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
          {liveEditingHolding && (
            <HoldingForm
              defaultValues={liveEditingHolding}
              onSubmit={handleUpdate}
              onCancel={() => setEditingHolding(null)}
              isEditing
              position={{
                symbol: liveEditingHolding.symbol,
                shares: liveEditingHolding.shares,
                averagePurchasePrice: liveEditingHolding.averagePurchasePrice,
              }}
              onBuy={handleBuy}
              buys={liveEditingHolding.buys ?? []}
              onUpdateBuy={handleUpdateBuy}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
