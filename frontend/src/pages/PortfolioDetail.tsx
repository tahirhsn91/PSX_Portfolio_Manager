import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, TrendingUp, DollarSign, Activity, Award, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { MetricCard, EmptyState } from '@/components/shared';
import { HoldingsTable } from '@/features/portfolio/HoldingsTable';
import { HoldingForm } from '@/features/portfolio/HoldingForm';
import { AllocationPieChart, PortfolioValueChart, KSE100ComparisonChart } from '@/features/charts';
import { usePortfolioStore, useUIStore } from '@/store';
import { usePortfolioMetrics, useKSE100 } from '@/hooks';
import { buildSectorAllocation } from '@/utils';
import { ROUTES } from '@/constants';
import type { Holding } from '@/types';
import type { HoldingFormValues } from '@/utils';

export function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === id));
  const { addHolding, updateHolding, deleteHolding } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const { metrics, isLoading } = usePortfolioMetrics(id);
  const { data: kse100 } = useKSE100();
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
  const kse100Return = kse100
    ? ((kse100.value - (kse100.historicalData[0]?.close ?? kse100.value)) / (kse100.historicalData[0]?.close ?? 1)) * 100
    : 0;

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Invested" value={metrics?.totalInvestment ?? 0} isCurrency compact icon={<DollarSign className="h-4 w-4" />} isLoading={isLoading} />
        <MetricCard title="Current Value" value={metrics?.currentValue ?? 0} isCurrency compact change={metrics?.totalPL} changePercent={metrics?.totalPLPercent} icon={<TrendingUp className="h-4 w-4" />} isLoading={isLoading} />
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
          <TabsTrigger value="comparison">vs KSE-100</TabsTrigger>
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
          {kse100 ? (
            <KSE100ComparisonChart
              portfolioData={kse100.historicalData}
              kse100Data={kse100.historicalData}
              portfolioReturnPercent={metrics?.totalReturnPercent ?? 0}
              kse100ReturnPercent={kse100Return}
            />
          ) : (
            <EmptyState title="KSE-100 data unavailable" />
          )}
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
