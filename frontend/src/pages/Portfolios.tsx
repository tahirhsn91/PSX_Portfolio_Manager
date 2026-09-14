import { useState } from 'react';
import { Plus, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared';
import { PortfolioCard } from '@/features/portfolio/PortfolioCard';
import { PortfolioForm } from '@/features/portfolio/PortfolioForm';
import { usePortfolioStore } from '@/store';
import { usePortfolioMetrics } from '@/hooks';
import { useUIStore } from '@/store';
import type { Portfolio } from '@/types';
import type { PortfolioFormValues } from '@/utils';

function PortfolioCardWithMetrics({ portfolio, onEdit, onDelete, onDuplicate }: {
  portfolio: Portfolio;
  onEdit: (p: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const { metrics, isLoading } = usePortfolioMetrics(portfolio.id);
  return (
    <PortfolioCard
      portfolio={portfolio}
      metrics={metrics}
      isLoading={isLoading}
      onEdit={onEdit}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
    />
  );
}

export function Portfolios() {
  const { portfolios, createPortfolio, updatePortfolio, deletePortfolio, duplicatePortfolio } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);

  const handleCreate = (values: PortfolioFormValues) => {
    createPortfolio(values);
    addNotification({ type: 'success', title: 'Portfolio created', message: `"${values.name}" is ready to use.` });
    setDialogOpen(false);
  };

  const handleUpdate = (values: PortfolioFormValues) => {
    if (!editingPortfolio) return;
    updatePortfolio({ id: editingPortfolio.id, ...values });
    addNotification({ type: 'success', title: 'Portfolio updated' });
    setEditingPortfolio(null);
  };

  const handleDelete = (id: string) => {
    const p = portfolios.find((p) => p.id === id);
    if (!p) return;
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    deletePortfolio(id);
    addNotification({ type: 'info', title: 'Portfolio deleted' });
  };

  const handleDuplicate = (id: string) => {
    duplicatePortfolio(id);
    addNotification({ type: 'success', title: 'Portfolio duplicated' });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">My Portfolios</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {portfolios.length} portfolio{portfolios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Portfolio
        </Button>
      </div>

      {/* Grid */}
      {portfolios.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8 text-muted-foreground" />}
          title="No portfolios yet"
          description="Create a portfolio to start tracking your PSX investments."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create Portfolio
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {portfolios.map((portfolio) => (
            <PortfolioCardWithMetrics
              key={portfolio.id}
              portfolio={portfolio}
              onEdit={setEditingPortfolio}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Portfolio</DialogTitle>
          </DialogHeader>
          <PortfolioForm
            onSubmit={handleCreate}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingPortfolio} onOpenChange={(o) => !o && setEditingPortfolio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Portfolio</DialogTitle>
          </DialogHeader>
          {editingPortfolio && (
            <PortfolioForm
              defaultValues={editingPortfolio}
              onSubmit={handleUpdate}
              onCancel={() => setEditingPortfolio(null)}
              isEditing
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
