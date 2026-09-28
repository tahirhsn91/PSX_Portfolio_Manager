import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Briefcase, Search, LayoutGrid, List, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader } from '@/components/shared';
import { PortfolioCard } from '@/features/portfolio/PortfolioCard';
import { PortfolioForm } from '@/features/portfolio/PortfolioForm';
import { usePortfolioStore } from '@/store';
import { usePortfolioMetrics } from '@/hooks';
import { useUIStore } from '@/store';
import { ROUTES, STORAGE_KEYS } from '@/constants';
import type { Portfolio } from '@/types';
import type { PortfolioFormValues } from '@/utils';

type SortKey = 'updated' | 'created' | 'name' | 'name-asc' | 'holdings';
type FilterKey = 'all' | 'with-holdings' | 'empty';
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
];

/** `Date.parse` of a stored timestamp, with a value that can be compared. */
function time(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The portfolios live in `localStorage` and are read back on hydrate. When that
 * read fails — storage blocked in a private window, a quota error, a backup
 * edited by hand — the store comes up empty, and the page would otherwise report
 * "No portfolios yet" over data that exists and merely cannot be read. Asking
 * the same key the store uses lets the page tell those two situations apart, and
 * offer a way out: retry, or restore from a backup file.
 */
function readStorageError(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.PORTFOLIOS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { portfolios?: unknown } };
    if (parsed && parsed.state && !Array.isArray(parsed.state.portfolios)) {
      return 'The saved data does not contain a list of portfolios.';
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('updated');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [view, setView] = useState<ViewKey>('grid');
  const [storageError, setStorageError] = useState<string | null>(() => readStorageError());

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

  const clearFilters = () => {
    setQuery('');
    setFilter('all');
  };

  /**
   * Re-read the storage probe, and if the data is readable again while the store
   * is still empty, reload: the store reads `localStorage` once, at boot, so a
   * repaired file cannot reach it any other way. Without this the retry cleared
   * the error and then reported the portfolio list as empty — the very lie the
   * error state exists to avoid.
   */
  const retryStorage = () => {
    const next = readStorageError();
    setStorageError(next);
    if (!next && !hasPortfolios) window.location.reload();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = portfolios.filter((p) => {
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
  }, [portfolios, query, sort, filter]);

  const count = portfolios.length;
  const hasPortfolios = count > 0;
  // A read failure with nothing on screen is the one case where "empty" would be
  // a lie, so the error state replaces the empty state instead of joining it.
  const showStorageError = !!storageError && !hasPortfolios;

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

      {hasPortfolios && !showStorageError && (
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
              <Tabs value={view} onValueChange={(value) => setView(value as ViewKey)}>
                <TabsList aria-label="Portfolio view">
                  <TabsTrigger value="grid">
                    <LayoutGrid aria-hidden="true" className="h-4 w-4" /> Grid
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <List aria-hidden="true" className="h-4 w-4" /> List
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {visible.length} of {count} portfolio{count !== 1 ? 's' : ''}
            {query.trim() && ` matching “${query.trim()}”`}
          </p>
        </div>
      )}

      {showStorageError ? (
        <ErrorState
          title="Your saved portfolios could not be read"
          description="The browser storage holding them is unavailable or damaged, so this page has nothing to show. Nothing has been deleted."
          detail={storageError ?? undefined}
          onRetry={retryStorage}
          action={importHint}
        />
      ) : !hasPortfolios ? (
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((portfolio) => (
            <PortfolioCardWithMetrics
              key={portfolio.id}
              portfolio={portfolio}
              onEdit={setEditingPortfolio}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((portfolio) => (
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
