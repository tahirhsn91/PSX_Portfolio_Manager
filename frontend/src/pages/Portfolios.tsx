import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Briefcase, Search, LayoutGrid, List, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog, EmptyState, PageHeader } from '@/components/shared';
import { ScrollReveal } from '@/components/animations';
import { PortfolioCard } from '@/features/portfolio/PortfolioCard';
import { PortfolioListRow } from '@/features/portfolio/PortfolioListRow';
import { PortfolioForm } from '@/features/portfolio/PortfolioForm';
import { usePortfolioStore } from '@/store';
import { usePortfolioMetrics } from '@/hooks';
import { useUIStore } from '@/store';
import { ROUTES } from '@/constants';
import type { Portfolio } from '@/types';
import type { PortfolioFormValues } from '@/utils';

type SortKey = 'updated' | 'created' | 'name' | 'name-asc' | 'holdings';
type FilterKey = 'all' | 'with-holdings' | 'empty' | 'archived';
type ViewKey = 'grid' | 'list';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Newest first' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name', label: 'Name Z–A' },
  { value: 'holdings', label: 'Most holdings' },
];

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: 'all', label: 'All portfolios' },
  { value: 'with-holdings', label: 'With holdings' },
  { value: 'empty', label: 'Empty portfolios' },
  { value: 'archived', label: 'Archived' },
];

/** `Date.parse` of a stored timestamp, with a value that can be compared. */
function time(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}


function PortfolioCardWithMetrics({ portfolio, onEdit, onDelete, onDuplicate, onArchive, onRestore }: {
  portfolio: Portfolio;
  onEdit: (p: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
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
      onArchive={onArchive}
      onRestore={onRestore}
    />
  );
}

function PortfolioListRowWithMetrics({ portfolio, onEdit, onDelete, onDuplicate, onArchive, onRestore }: {
  portfolio: Portfolio;
  onEdit: (p: Portfolio) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const { metrics, isLoading } = usePortfolioMetrics(portfolio.id);
  return (
    <PortfolioListRow
      portfolio={portfolio}
      metrics={metrics}
      isLoading={isLoading}
      onEdit={onEdit}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onArchive={onArchive}
      onRestore={onRestore}
    />
  );
}

export function Portfolios() {
  const { portfolios, createPortfolio, updatePortfolio, deletePortfolio, duplicatePortfolio, archivePortfolio, restorePortfolio } =
    usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Portfolio | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [view, setView] = useState<ViewKey>('grid');

  /*
   * Every one of these writes to the server now, so they can fail — and a failure
   * must not look like a success with a dialog that closed. The API's own message is
   * what the user sees: it already says which field it refused.
   */
  const handleCreate = async (values: PortfolioFormValues) => {
    try {
      await createPortfolio(values);
      addNotification({ type: 'success', title: 'Portfolio created', message: `"${values.name}" is ready to use.` });
      setDialogOpen(false);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not create the portfolio',
        message: (err as Error).message,
      });
    }
  };

  const handleUpdate = async (values: PortfolioFormValues) => {
    if (!editingPortfolio) return;
    try {
      await updatePortfolio({ id: editingPortfolio.id, ...values });
      addNotification({ type: 'success', title: 'Portfolio updated' });
      setEditingPortfolio(null);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not update the portfolio',
        message: (err as Error).message,
      });
    }
  };

  // Deletion opens the app's own dialog instead of `window.confirm`: the browser
  // modal blocks the page, cannot show a pending state, and looked nothing like the
  // rest of the app. The actual request runs from the dialog's confirm handler.
  const handleDelete = (id: string) => {
    const p = portfolios.find((candidate) => candidate.id === id);
    if (!p) return;
    // The row's menu is still closing. Opening the dialog in the same tick made it
    // record the (now unmounted) menu item as the element to return focus to, so
    // Escape dropped focus on <body>; one tick later it records the menu's trigger.
    setTimeout(() => setPendingDelete(p), 0);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deletePortfolio(pendingDelete.id);
      addNotification({
        type: 'info',
        title: 'Portfolio deleted',
        message: `"${pendingDelete.name}" and its history are gone.`,
      });
      setPendingDelete(null);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not delete the portfolio',
        message: (err as Error).message,
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicatePortfolio(id);
      addNotification({ type: 'success', title: 'Portfolio duplicated' });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not duplicate the portfolio',
        message: (err as Error).message,
      });
    }
  };

  const handleArchive = async (id: string) => {
    const p = portfolios.find((x) => x.id === id);
    if (!p) return;
    try {
      await archivePortfolio(id);
      addNotification({
        type: 'info',
        title: `Archived "${p.name}"`,
        message: 'Its data is kept — restore it anytime from the Archived filter.',
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not archive the portfolio',
        message: (err as Error).message,
      });
    }
  };

  const handleRestore = async (id: string) => {
    const p = portfolios.find((x) => x.id === id);
    if (!p) return;
    try {
      await restorePortfolio(id);
      addNotification({ type: 'success', title: `Restored "${p.name}"` });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not restore the portfolio',
        message: (err as Error).message,
      });
    }
  };

  const clearFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const activePortfolios = useMemo(() => portfolios.filter((p) => !p.archivedAt), [portfolios]);
  const archivedPortfolios = useMemo(() => portfolios.filter((p) => !!p.archivedAt), [portfolios]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = filter === 'archived' ? archivedPortfolios : activePortfolios;
    const matched = base.filter((p) => {
      if (filter === 'with-holdings' && p.holdings.length === 0) return false;
      if (filter === 'empty' && p.holdings.length > 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.holdings.some(
          (h) => h.symbol.toLowerCase().includes(q) || h.companyName.toLowerCase().includes(q),
        )
      );
    });

    const sorted = [...matched];
    switch (sort) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'created':
        sorted.sort((a, b) => time(b.createdAt) - time(a.createdAt));
        break;
      case 'holdings':
        sorted.sort((a, b) => b.holdings.length - a.holdings.length);
        break;
      case 'updated':
      default:
        sorted.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    }
    return sorted;
  }, [activePortfolios, archivedPortfolios, query, sort, filter]);

  const count = activePortfolios.length;
  const hasPortfolios = portfolios.length > 0;

  const importHint = (
    <Button variant="outline" asChild>
      <Link to={ROUTES.SETTINGS}>
        <Upload aria-hidden="true" /> Import backup
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Portfolios"
        description="Everything you track, with live value, return and today's move."
        meta={
          <p className="text-xs text-muted-foreground">
            {count} portfolio{count !== 1 ? 's' : ''}
          </p>
        }
        /* One primary creation affordance on the page at a time: while the list
           is empty the empty state below owns it, and this header would only be
           a second, louder way to do the same thing. */
        actions={hasPortfolios ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus aria-hidden="true" /> New portfolio
          </Button>
        ) : undefined}
      />

      {hasPortfolios && (
        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="portfolio-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or ticker"
                aria-label="Search portfolios"
                className="h-11 pl-10"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={filter} onValueChange={(value) => setFilter(value as FilterKey)}>
                <SelectTrigger className="h-11 w-full sm:w-44" aria-label="Filter portfolios">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger className="h-11 w-full sm:w-48" aria-label="Sort portfolios">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>Sort by {o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* The view switch is a real 44px tab strip, not two icons: the
                  segmented variant is 40px and would fall under the minimum. */}
              <SegmentedControl
                label="Portfolio view"
                value={view}
                onValueChange={setView}
                options={[
                  {
                    value: 'grid',
                    label: 'Grid',
                    icon: <LayoutGrid aria-hidden="true" className="h-4 w-4" />,
                  },
                  {
                    value: 'list',
                    label: 'List',
                    icon: <List aria-hidden="true" className="h-4 w-4" />,
                  },
                ]}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {visible.length} of {count} portfolio{count !== 1 ? 's' : ''}
            {query.trim() && ` matching “${query.trim()}”`}
          </p>
        </div>
      )}

      {!hasPortfolios ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
          title="No portfolios yet"
          description="A portfolio groups the PSX stocks you hold so the app can value them, track your return and show today's move. Create one, then add your first holding."
          action={
            <div className="flex flex-col items-center gap-2">
              <Button onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" /> Create portfolio
              </Button>
              <p className="text-xs text-muted-foreground">
                Already have a backup? Import it from Settings.
              </p>
              {importHint}
            </div>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
          title="No portfolios match"
          description="No portfolio matches the current search and filter. Clear them to see all of your portfolios again."
          action={
            <Button variant="outline" onClick={clearFilters}>
              <X aria-hidden="true" /> Clear search and filters
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <ScrollReveal>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((portfolio) => (
            <PortfolioCardWithMetrics
              key={portfolio.id}
              portfolio={portfolio}
              onEdit={setEditingPortfolio}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
          ))}
        </div>
        </ScrollReveal>
      ) : (
        <ScrollReveal>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {visible.map((portfolio) => (
            <PortfolioListRowWithMetrics
              key={portfolio.id}
              portfolio={portfolio}
              onEdit={setEditingPortfolio}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onRestore={handleRestore}
            />
          ))}
        </ul>
        </ScrollReveal>
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

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        title={`Delete "${pendingDelete?.name ?? 'this portfolio'}"?`}
        description="Every holding, buy record, dividend and cash entry in this portfolio is deleted with it. This cannot be undone — export a backup first if you might want it back."
        confirmLabel="Delete portfolio"
        pendingLabel="Deleting…"
        destructive
        pending={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
