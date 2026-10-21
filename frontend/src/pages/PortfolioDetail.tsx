import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, TrendingUp, DollarSign, Award, TriangleAlert, Trash2, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, MetricBand, PLValue, PageHeader, CompanySearch } from '@/components/shared';
import { ScrollReveal } from '@/components/animations';
import type { BandStat } from '@/components/shared';
import { HoldingsTable } from '@/features/portfolio/HoldingsTable';
import { HoldingForm } from '@/features/portfolio/HoldingForm';
import { DividendCalendar } from '@/features/portfolio/DividendCalendar';
import { RiskAnalytics } from '@/features/portfolio/RiskAnalytics';
import { ScenarioAnalysis } from '@/features/portfolio/ScenarioAnalysis';
import { TargetAllocation } from '@/features/portfolio/TargetAllocation';
import {
  AllocationPieChart,
  PortfolioValueChart,
  BenchmarkComparisonChart,
  rangeDays,
} from '@/features/charts';
import type { ComparisonBenchmark, ComparisonRange } from '@/features/charts';
import { usePortfolioStore, useUIStore } from '@/store';
import { ApiError } from '@/services/http';
import { usePortfolioMetrics, useIndex, usePortfolioHistory, useCandles } from '@/hooks';
import { buildSectorAllocation, buildHoldingAllocation } from '@/utils';
import { ROUTES, PSX_INDICES, DEFAULT_INDEX_CODE, indexLabel } from '@/constants';
import { format, parseISO } from 'date-fns';
import type { Holding, PSXCompany, DeclaredDividendInput, CorporateActionInput } from '@/types';
import {
  formatCurrency,
  formatPercent,
  type HoldingFormValues,
  type BuyFormValues,
  type SellFormValues,
} from '@/utils';

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
  const {
    addHolding,
    updateHolding,
    buyInto,
    updateBuy,
    deleteBuy,
    deleteHolding,
    sell,
    updateSell,
    deleteSell,
    addCash,
    deleteCash,
    addDeclaredDividend,
    deleteDeclaredDividend,
    addCorporateAction,
    deleteCorporateAction,
  } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const { metrics, isLoading } = usePortfolioMetrics(id);
  const [range, setRange] = useState<ComparisonRange>('3M');
  // The allocation card shows one breakdown at a time; Holdings is the default.
  const [allocationView, setAllocationView] = useState<AllocationView>('holdings');
  // What to compare against: a PSX index code, or any listed stock's symbol.
  const [benchmark, setBenchmark] = useState<Benchmark>(DEFAULT_BENCHMARK);

  const rangeDaysValue = rangeDays(range);
  // One window for both sides of the comparison: the index series used to be fetched
  // as a fixed 1Y clip, so ALL collapsed to the same year as 1Y.
  const {
    series: portfolioSeries,
    backtestSeries,
    isLoading: portfolioHistoryLoading,
    window: historyWindow,
  } = usePortfolioHistory(portfolio?.holdings, rangeDaysValue);

  // Whichever the benchmark is, fetch its own series for the selected period from the
  // feed's candles. The feed treats `to` as exclusive, so the window runs to tomorrow.
  const indexQuery = useIndex(
    benchmark.kind === 'index' ? benchmark.code : undefined,
    historyWindow,
  );
  const { data: benchmarkStockHistory = [], isLoading: benchmarkStockLoading } = useCandles(
    benchmark.kind === 'stock' ? benchmark.code : undefined,
    historyWindow,
  );

  const comparisonBenchmark: ComparisonBenchmark = {
    id: benchmark.code,
    label: benchmark.label,
    kind: benchmark.kind,
    series:
      benchmark.kind === 'index' ? (indexQuery.data?.historicalData ?? []) : benchmarkStockHistory,
  };

  const [addOpen, setAddOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  // Removal is confirmed in a dialog rather than `window.confirm`, so the warning
  // names the holding, states what else goes with it, and can be styled.
  const [holdingToDelete, setHoldingToDelete] = useState<Holding | null>(null);
  // Cash movements (deposits/withdrawals) — a small inline form, not a dialog.
  const [cashOpen, setCashOpen] = useState(false);
  const [cashType, setCashType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cashNotes, setCashNotes] = useState('');

  if (!portfolio || !id) {
    return (
      // The heading stays: a page whose early return skipped it had no <h1> at
      // all, so nothing named the screen for a screen reader or in the outline.
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={[{ label: 'Portfolios', to: ROUTES.PORTFOLIOS }, { label: 'Not found' }]}
          title="Portfolio not found"
          description="It may have been deleted, or the link may belong to another device's data."
        />
        <div className="mx-auto max-w-xl py-10">
          <EmptyState
            title="Portfolio not found"
            description="It may have been deleted, or the link may belong to another device's data."
            action={<Button onClick={() => navigate(ROUTES.PORTFOLIOS)}>Back to portfolios</Button>}
          />
        </div>
      </div>
    );
  }

  /**
   * The holding the edit dialog is open on, read back from the store rather
   * than from the snapshot that opened it: correcting a trade re-derives the
   * position, and the dialog has to show that new position immediately.
   */
  const liveEditingHolding = editingHolding
    ? (portfolio.holdings.find((h) => h.id === editingHolding.id) ?? editingHolding)
    : null;

  const handleAdd = async (values: HoldingFormValues) => {
    try {
      await addHolding({ portfolioId: id, ...values });
      addNotification({ type: 'success', title: `${values.symbol} added to portfolio` });
      setAddOpen(false);
    } catch (err) {
      addNotification({
        type: 'error',
        title: `Could not add ${values.symbol}`,
        message: (err as Error).message,
      });
    }
  };

  /**
   * Correcting a logged purchase: the store re-derives the position's quantity
   * and average from the whole log. The dialog stays open — the history it
   * shows has just changed — and the notification reports the new position.
   */
  const handleUpdateBuy = async (
    buyId: string,
    patch: { shares: number; pricePerShare: number }
  ) => {
    if (!editingHolding) return;
    try {
      const updated = await updateBuy(id, editingHolding.id, buyId, patch);
      if (!updated) return;
      addNotification({
        type: 'success',
        title: 'Purchase updated',
        message: `${updated.symbol} is now ${updated.shares.toLocaleString()} shares at ${formatCurrency(updated.averagePurchasePrice)} average.`,
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not update the purchase',
        message: (err as Error).message,
      });
    }
  };

  /**
   * Removing a logged purchase. The store re-derives the position from what is
   * left, so the numbers reported are the position's, not a subtraction — and
   * when the purchase removed was the last one, the holding goes with it.
   */
  const handleDeleteBuy = async (buyId: string) => {
    if (!editingHolding) return;
    const removed = (editingHolding.buys ?? []).find((b) => b.id === buyId);
    let result;
    try {
      result = await deleteBuy(id, editingHolding.id, buyId);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not remove the purchase',
        message: (err as Error).message,
      });
      return;
    }
    if (!result || !removed) return;

    if (result.kind === 'holding-removed') {
      // Nothing left to edit: close the dialog rather than show a stale row.
      setEditingHolding(null);
      addNotification({
        type: 'success',
        title: `${editingHolding.symbol} removed from the portfolio`,
        message: `Its last purchase — ${removed.shares.toLocaleString()} at ${formatCurrency(removed.pricePerShare)} — was deleted.`,
      });
      return;
    }

    const updated = result.holding;
    addNotification({
      type: 'success',
      title: `Removed ${removed.shares.toLocaleString()} ${updated.symbol} bought ${format(parseISO(removed.date), 'dd MMM yyyy')}`,
      message: `${updated.symbol} is now ${updated.shares.toLocaleString()} shares at ${formatCurrency(updated.averagePurchasePrice)} average.`,
    });
  };

  const handleUpdate = async (values: HoldingFormValues) => {
    if (!editingHolding) return;
    try {
      await updateHolding(id, { id: editingHolding.id, ...values });
      addNotification({ type: 'success', title: 'Holding updated' });
      setEditingHolding(null);
    } catch (err) {
      // The buy log can refuse an edit it cannot represent — editing a position below
      // what its real purchases already account for. The server leaves the holding
      // exactly as it was, and this is the only place that can explain why.
      const refused = err instanceof ApiError && err.isLogConflict;
      addNotification({
        type: 'error',
        title: refused ? 'That edit cannot be logged' : 'Could not update the holding',
        message: (err as Error).message,
      });
    }
  };

  /**
   * A second purchase of a stock already held. The store blends the quantity
   * and the weighted average and appends the purchase to the holding's log; all
   * this has to do is report what changed.
   */
  const handleBuy = async (values: BuyFormValues) => {
    if (!editingHolding) return;
    const before = `${editingHolding.shares.toLocaleString()} @ ${formatCurrency(editingHolding.averagePurchasePrice)}`;
    try {
      const updated = await buyInto(id, {
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
    } catch (err) {
      addNotification({
        type: 'error',
        title: `Could not log the purchase of ${values.shares.toLocaleString()} shares`,
        message: (err as Error).message,
      });
    }
  };

  /**
   * A sale of part of a held stock. The store replays buys + sells to derive the
   * position and realized P/L; an oversell is refused with a 409, which the error
   * notification reports in the server's own words.
   */
  const handleSell = async (values: SellFormValues) => {
    if (!editingHolding) return;
    const before = `${editingHolding.shares.toLocaleString()} @ ${formatCurrency(editingHolding.averagePurchasePrice)}`;
    try {
      const updated = await sell(id, {
        holdingId: editingHolding.id,
        shares: values.shares,
        pricePerShare: values.pricePerShare,
        fees: values.fees,
        date: values.date,
      });
      if (!updated) return;
      addNotification({
        type: 'success',
        title: `Sold ${values.shares.toLocaleString()} ${updated.symbol}`,
        message: `Now ${updated.shares.toLocaleString()} shares at ${formatCurrency(updated.averagePurchasePrice)} average (was ${before}).`,
      });
      setEditingHolding(null);
    } catch (err) {
      addNotification({
        type: 'error',
        title: `Could not log the sale of ${values.shares.toLocaleString()} shares`,
        message: (err as Error).message,
      });
    }
  };

  /** Correcting a logged sale: the position re-derives from the whole ledger. */
  const handleUpdateSell = async (
    sellId: string,
    patch: { shares: number; pricePerShare: number; fees: number }
  ) => {
    if (!editingHolding) return;
    const existing = (editingHolding.sells ?? []).find((s) => s.id === sellId);
    if (!existing) return;
    try {
      const updated = await updateSell(id, editingHolding.id, sellId, {
        ...patch,
        date: existing.date,
      });
      if (!updated) return;
      addNotification({
        type: 'success',
        title: 'Sale updated',
        message: `${updated.symbol} is now ${updated.shares.toLocaleString()} shares at ${formatCurrency(updated.averagePurchasePrice)} average.`,
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not update the sale',
        message: (err as Error).message,
      });
    }
  };

  /** Removing a logged sale: the position gains those shares back. */
  const handleDeleteSell = async (sellId: string) => {
    if (!editingHolding) return;
    const removed = (editingHolding.sells ?? []).find((s) => s.id === sellId);
    try {
      await deleteSell(id, editingHolding.id, sellId);
      addNotification({
        type: 'success',
        title: removed
          ? `Removed sale of ${removed.shares.toLocaleString()} ${editingHolding.symbol}`
          : 'Sale removed',
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not remove the sale',
        message: (err as Error).message,
      });
    }
  };

  /** Apply a corporate action; the position is re-derived from the ledger. */
  const handleAddCorporateAction = async (input: Omit<CorporateActionInput, 'holdingId'>) => {
    if (!editingHolding) return;
    try {
      await addCorporateAction(id, editingHolding.id, input);
      addNotification({
        type: 'success',
        title: `${input.type} applied to ${editingHolding.symbol}`,
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not apply the corporate action',
        message: (err as Error).message,
      });
    }
  };

  /** Undo a corporate action; the position is re-derived from the ledger. */
  const handleDeleteCorporateAction = async (actionId: string) => {
    if (!editingHolding) return;
    try {
      await deleteCorporateAction(id, editingHolding.id, actionId);
      addNotification({ type: 'info', title: 'Corporate action undone' });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not undo the corporate action',
        message: (err as Error).message,
      });
    }
  };

  /** Record a cash movement. The amount must be a positive number; type signs it. */
  const handleAddCash = async () => {
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      await addCash(id, {
        date: cashDate,
        type: cashType,
        amount,
        notes: cashNotes.trim() || undefined,
      });
      addNotification({
        type: 'success',
        title: `${cashType === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${formatCurrency(amount)} recorded`,
      });
      setCashOpen(false);
      setCashAmount('');
      setCashNotes('');
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not record the cash entry',
        message: (err as Error).message,
      });
    }
  };

  const handleDeleteCash = async (cashId: string) => {
    try {
      await deleteCash(id, cashId);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not remove the cash entry',
        message: (err as Error).message,
      });
    }
  };

  const handleAddDeclaredDividend = async (
    holdingId: string,
    input: Omit<DeclaredDividendInput, 'holdingId'>
  ) => {
    try {
      await addDeclaredDividend(id, holdingId, input);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not save the declared dividend',
        message: (err as Error).message,
      });
    }
  };

  const handleDeleteDeclaredDividend = async (holdingId: string, dividendId: string) => {
    try {
      await deleteDeclaredDividend(id, holdingId, dividendId);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not remove the declared dividend',
        message: (err as Error).message,
      });
    }
  };

  const confirmDeleteHolding = async () => {
    const holding = holdingToDelete;
    if (!holding) return;
    try {
      await deleteHolding(id, holding.id);
      addNotification({ type: 'info', title: `${holding.symbol} removed` });
      setHoldingToDelete(null);
    } catch (err) {
      addNotification({
        type: 'error',
        title: `Could not remove ${holding.symbol}`,
        message: (err as Error).message,
      });
    }
  };

  const sectorAlloc = buildSectorAllocation(portfolio, metrics?.holdingMetrics ?? []);
  const holdingAlloc = buildHoldingAllocation(portfolio, metrics?.holdingMetrics ?? []);

  // Every dividend recorded on any holding, newest first — the detail behind the
  // "Dividends — Total received" figure in the band.
  const dividends = portfolio.holdings
    .flatMap((h) =>
      (h.dividendsReceived ?? []).map((d) => ({
        ...d,
        symbol: h.symbol,
        companyName: h.companyName,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  // Net cash = deposits − withdrawals, over every entry the account has logged.
  const cashTransactions = portfolio.cashTransactions ?? [];
  const cashBalance = cashTransactions.reduce(
    (sum, c) => sum + (c.type === 'deposit' ? c.amount : -c.amount),
    0
  );

  // One card, two breakdowns: whichever the switch has selected is the pie that
  // is mounted, so the row spends a single slot on the question either way.
  // `gain` rides along so the pie can colour a slice green or red by whether the
  // holding (or the sector's holdings) is up or down, and pick a tone within that
  // family so neighbouring slices stay distinguishable.
  const allocationData =
    allocationView === 'holdings'
      ? holdingAlloc.map((h) => ({
          name: h.name,
          value: h.value,
          percent: h.percent,
          color: h.color,
          gain: h.gain,
          gainPercent: h.gainPercent,
        }))
      : sectorAlloc.map((s) => ({
          name: s.sector,
          value: s.value,
          percent: s.percent,
          color: s.color,
          gain: s.gain,
          gainPercent: s.gainPercent,
        }));
  const allocationTitle =
    allocationView === 'holdings' ? 'Holdings Allocation' : 'Sector Allocation';

  const totalPL = metrics?.totalPL ?? 0;
  const tone = totalPL > 0 ? 'profit' : totalPL < 0 ? 'loss' : 'neutral';
  const todayPL = metrics?.todayPL ?? 0;
  const todayTone = todayPL > 0 ? 'profit' : todayPL < 0 ? 'loss' : 'neutral';

  const stats: BandStat[] = [
    { label: 'Invested', value: formatCurrency(metrics?.totalInvestment ?? 0) },
    {
      label: "Today's P&L",
      value: formatCurrency(todayPL),
      hint:
        metrics?.todayPLPercent !== undefined ? formatPercent(metrics.todayPLPercent) : undefined,
      tone: todayTone,
    },
    {
      label: 'Dividends',
      value: formatCurrency(metrics?.totalDividendIncome ?? 0),
      hint: 'Total received',
    },
    {
      label: 'Realized P/L',
      value: formatCurrency(metrics?.totalRealizedPL ?? 0),
      hint: 'Booked on sales',
    },
    {
      label: 'Holdings',
      value: String(portfolio.holdings.length),
      hint: `${holdingAlloc.length} priced`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Portfolios', to: ROUTES.PORTFOLIOS }, { label: portfolio.name }]}
        title={portfolio.name}
        description={`${portfolio.holdings.length} holding${portfolio.holdings.length === 1 ? '' : 's'} · valued from live PSX prices`}
        meta={
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full border"
              style={{ backgroundColor: portfolio.color }}
            />
            Portfolio colour
          </p>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.PLANNER_PATH({ portfolio: portfolio.id }))}
            >
              <Calculator aria-hidden="true" />
              Plan a buy
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus aria-hidden="true" />
              Add holding
            </Button>
          </div>
        }
      />
      <ScrollReveal className="space-y-6">
        {/* Answer first, then the supporting figures — the same band as the Dashboard. */}
        <MetricBand
          label="Current value"
          value={formatCurrency(metrics?.currentValue ?? 0)}
          animateValue={metrics?.currentValue}
          animateFormat={(n) => formatCurrency(n)}
          change={{
            amount: formatCurrency(totalPL),
            percent:
              metrics?.totalPLPercent !== undefined
                ? formatPercent(metrics.totalPLPercent)
                : undefined,
            tone,
          }}
          stats={stats}
          isLoading={isLoading}
          notice={
            metrics && metrics.unpricedHoldings > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-light p-3 text-xs text-warning-dark">
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <span className="font-medium">
                    {metrics.unpricedHoldings} of {portfolio.holdings.length} holdings have no price
                  </span>{' '}
                  ({metrics.unpricedSymbols.join(', ')}) — the figures above cover the other{' '}
                  {portfolio.holdings.length - metrics.unpricedHoldings}. A holding with no price is
                  left out rather than counted as zero.
                </p>
              </div>
            ) : undefined
          }
        />

        {/* Leaders: the question "which of my holdings is doing the work?" — one row
          each, and a way through to the full story for that stock. */}
        {metrics?.bestPerformer && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Performance leaders</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ul className="divide-y">
                {[
                  { label: 'Best', holding: metrics.bestPerformer },
                  { label: 'Worst', holding: metrics.worstPerformer },
                ]
                  .filter(
                    (row): row is { label: string; holding: NonNullable<typeof row.holding> } =>
                      Boolean(row.holding)
                  )
                  .map(({ label, holding }) => (
                    <li key={label}>
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.STOCK_DETAIL_PATH(id, holding.symbol))}
                        className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-base ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="w-12 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                          {label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-semibold">{holding.symbol}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            unrealised return
                          </span>
                        </span>
                        <PLValue value={holding.returnPercent} />
                        {label === 'Best' ? (
                          <Award aria-hidden="true" className="h-4 w-4 shrink-0 text-profit" />
                        ) : (
                          <TrendingUp aria-hidden="true" className="h-4 w-4 shrink-0 text-loss" />
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Underline tabs: these are views of one portfolio, not modes of the app. */}
        <Tabs defaultValue="holdings">
          <TabsList
            variant="underline"
            className="max-lg:flex-nowrap max-lg:overflow-x-auto no-scrollbar"
          >
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            <TabsTrigger value="dividends" title="Dividend calendar and received payouts">
              Dividends
            </TabsTrigger>
            <TabsTrigger value="risk" title="Risk analytics">
              Risk
            </TabsTrigger>
            <TabsTrigger value="scenario" title="Scenario analysis">
              Scenario
            </TabsTrigger>
            <TabsTrigger value="target" title="Target allocation">
              Target
            </TabsTrigger>
            <TabsTrigger value="cash" title="Cash balance and transactions">
              Cash
            </TabsTrigger>
            <TabsTrigger value="charts">Value & allocation</TabsTrigger>
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
                icon={<DollarSign className="h-6 w-6" />}
                title="No holdings yet"
                description="Record what you bought and what you paid — the value, profit and allocation figures all come from here."
                action={
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus aria-hidden="true" />
                    Add holding
                  </Button>
                }
              />
            ) : (
              <>
                <HoldingsTable
                  holdings={portfolio.holdings}
                  metrics={metrics?.holdingMetrics ?? []}
                  portfolioId={id}
                  isLoading={isLoading}
                  onEdit={setEditingHolding}
                  onDelete={(holdingId) =>
                    setHoldingToDelete(portfolio.holdings.find((h) => h.id === holdingId) ?? null)
                  }
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="dividends" className="mt-4">
            <div className="space-y-4">
              {/* The detail behind "Dividends — Total received": one row per payout,
                newest first, with the per-share rate and the cash it paid. */}
              {dividends.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Dividends</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <ul className="divide-y">
                      {dividends.map((d) => (
                        <li key={d.id} className="flex items-baseline justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold">
                              {d.symbol}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {d.companyName}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(d.date), 'dd MMM yyyy')} ·{' '}
                              {formatCurrency(d.amountPerShare)} per share · {d.type}
                            </p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
                            {formatCurrency(d.totalAmount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <DividendCalendar
                portfolio={portfolio}
                onAdd={handleAddDeclaredDividend}
                onDelete={handleDeleteDeclaredDividend}
              />
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <RiskAnalytics holdings={portfolio.holdings} />
          </TabsContent>

          <TabsContent value="scenario" className="mt-4">
            <ScenarioAnalysis holdingMetrics={metrics?.holdingMetrics ?? []} />
          </TabsContent>

          <TabsContent value="target" className="mt-4">
            <TargetAllocation
              portfolio={portfolio}
              holdingMetrics={metrics?.holdingMetrics ?? []}
            />
          </TabsContent>

          <TabsContent value="cash" className="mt-4">
            {/* Cash movements: a balance, the entries behind it, and an inline
              form to add one. Net cash = deposits − withdrawals. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Cash</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Net cash (deposits − withdrawals)</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatCurrency(cashBalance)}
                  </p>
                </div>

                {cashTransactions.length > 0 && (
                  <ul className="divide-y">
                    {cashTransactions.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm">
                            <span className="font-medium">
                              {c.type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                            </span>
                            {c.notes && (
                              <span className="ml-2 text-xs text-muted-foreground">{c.notes}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(c.date), 'dd MMM yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-sm tabular-nums ${c.type === 'deposit' ? 'text-profit' : 'text-loss'}`}
                          >
                            {c.type === 'deposit' ? '+' : '−'}
                            {formatCurrency(c.amount)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${c.type}`}
                            onClick={() => handleDeleteCash(c.id)}
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {cashOpen ? (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={cashType === 'deposit' ? 'default' : 'outline'}
                        onClick={() => setCashType('deposit')}
                      >
                        Deposit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={cashType === 'withdrawal' ? 'default' : 'outline'}
                        onClick={() => setCashType('withdrawal')}
                      >
                        Withdrawal
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cashAmount">Amount (PKR) *</Label>
                        <Input
                          id="cashAmount"
                          type="number"
                          step="0.01"
                          className="h-11 tabular-nums"
                          placeholder="0"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cashDate">Date *</Label>
                        <Input
                          id="cashDate"
                          type="date"
                          className="h-11"
                          value={cashDate}
                          onChange={(e) => setCashDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cashNotes">Notes</Label>
                      <Input
                        id="cashNotes"
                        className="h-11"
                        placeholder="Optional"
                        value={cashNotes}
                        onChange={(e) => setCashNotes(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setCashOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handleAddCash}
                        disabled={!Number(cashAmount) || Number(cashAmount) <= 0}
                      >
                        Record {cashType}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setCashOpen(true)}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Add cash
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charts" className="mt-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
                      <TabsList variant="segmented">
                        <TabsTrigger value="holdings">Holdings</TabsTrigger>
                        <TabsTrigger value="sector">Sector</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  }
                />
              )}
              <PortfolioValueChart
                series={portfolioSeries}
                title="Portfolio Value"
                rangeDays={rangeDaysValue}
              />
            </div>
          </TabsContent>

          <TabsContent value="comparison" className="mt-4">
            {/* Rendered unconditionally so the section always names the portfolio;
              the chart itself owns the "no data" states. */}
            <BenchmarkComparisonChart
              title={`${portfolio.name} vs ${benchmark.label}`}
              portfolioLabel={portfolio.name}
              portfolioData={backtestSeries}
              benchmark={comparisonBenchmark}
              range={range}
              onRangeChange={setRange}
              portfolioLoading={portfolioHistoryLoading}
              benchmarkLoading={
                benchmark.kind === 'index' ? indexQuery.isLoading : benchmarkStockLoading
              }
              benchmarkSelector={
                <CompanySearch
                  className="w-full sm:w-60"
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
            <DialogHeader>
              <DialogTitle>Add Holding</DialogTitle>
            </DialogHeader>
            <HoldingForm onSubmit={handleAdd} onCancel={() => setAddOpen(false)} />
          </DialogContent>
        </Dialog>

        {/* Edit holding dialog */}
        <Dialog open={!!editingHolding} onOpenChange={(o) => !o && setEditingHolding(null)}>
          {/* Wider only when it has a transactions table to show. */}
          <DialogContent className={liveEditingHolding?.buys?.length ? 'max-w-2xl' : 'max-w-xl'}>
            <DialogHeader>
              <DialogTitle>Edit Holding</DialogTitle>
            </DialogHeader>
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
                onDeleteBuy={handleDeleteBuy}
                sells={liveEditingHolding.sells ?? []}
                onSell={handleSell}
                onUpdateSell={handleUpdateSell}
                onDeleteSell={handleDeleteSell}
                actions={liveEditingHolding.corporateActions ?? []}
                onAddAction={handleAddCorporateAction}
                onDeleteAction={handleDeleteCorporateAction}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Removing a holding is destructive and irreversible in this app (there is
          no undo), so it asks first and says what will be lost. */}
        <Dialog open={!!holdingToDelete} onOpenChange={(o) => !o && setHoldingToDelete(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Remove {holdingToDelete?.symbol}?</DialogTitle>
              <DialogDescription>
                {holdingToDelete && (
                  <>
                    {holdingToDelete.shares.toLocaleString()} shares at{' '}
                    {formatCurrency(holdingToDelete.averagePurchasePrice)} average
                    {holdingToDelete.buys?.length
                      ? `, with ${holdingToDelete.buys.length} logged purchase${holdingToDelete.buys.length === 1 ? '' : 's'}`
                      : ''}
                    . This cannot be undone.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setHoldingToDelete(null)}>
                Keep holding
              </Button>
              <Button variant="destructive" onClick={confirmDeleteHolding}>
                Remove holding
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ScrollReveal>
    </div>
  );
}
