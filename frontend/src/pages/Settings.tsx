import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  Monitor,
  Moon,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared';
import { useUIStore, usePortfolioStore } from '@/store';
import { storageService } from '@/services';
import { useReducedMotion, useTheme } from '@/hooks';
import { APP_NAME, APP_VERSION } from '@/constants';
import { cn } from '@/lib/utils';

type ThemeValue = 'light' | 'dark' | 'system';

/** The three appearance choices, each with the sentence that explains it. */
const THEME_OPTIONS: { value: ThemeValue; label: string; hint: string; icon: LucideIcon }[] = [
  {
    value: 'light',
    label: 'Light',
    hint: 'Always light, whatever the device is set to.',
    icon: Sun,
  },
  {
    value: 'dark',
    label: 'Dark',
    hint: 'Always dark, whatever the device is set to.',
    icon: Moon,
  },
  {
    value: 'system',
    label: 'System',
    hint: 'Follows the device setting, and switches with it while the app stays open.',
    icon: Monitor,
  },
];

/** Section ids, in page order — the sticky nav targets exactly these. */
const SECTIONS = [
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-data', label: 'Data' },
  { id: 'settings-about', label: 'About' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

/**
 * One frame of breathing room before a synchronous blocking job.
 *
 * Export serialises every portfolio and starts a download on the main thread, so
 * without this yield the button would jump from idle straight to "done" and its
 * pending state would never paint. `requestAnimationFrame` is absent outside a
 * real document, hence the timer fallback.
 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

export function Settings() {
  const { settings, updateSettings, resetSettings } = useUIStore();
  const { portfolios, importPortfolios, clearAll } = usePortfolioStore();
  const addNotification = useUIStore((s) => s.addNotification);
  const { theme, setTheme } = useTheme();
  const reducedMotion = useReducedMotion();

  const [activeSection, setActiveSection] = useState<SectionId>('settings-appearance');
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const storageInfo = storageService.getStorageInfo();
  const activeTheme = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  const portfolioLabel = `${portfolios.length} portfolio${portfolios.length === 1 ? '' : 's'}`;

  /*
   * Scroll-spy: the nav marks the section the reader is in, not the one they last
   * clicked. An observer (rather than a scroll listener) means nothing runs per
   * frame, and the root margin keeps the "current" band in the upper part of the
   * viewport so a section lights up as its heading arrives.
   */
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible: Record<string, boolean> = {};
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible[entry.target.id] = entry.isIntersecting;
        const current = SECTIONS.find((section) => visible[section.id]);
        if (current) setActiveSection(current.id);
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const goToSection = (id: SectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView?.({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const handleExport = async () => {
    setIsExporting(true);
    setDataError(null);
    try {
      await nextFrame();
      storageService.exportToFile();
      addNotification({ type: 'success', title: 'Backup exported', message: 'JSON file downloaded.' });
    } catch (err) {
      const message = (err as Error).message || 'The backup could not be written.';
      setDataError(`Export failed — ${message}. Nothing was changed.`);
      addNotification({ type: 'error', title: 'Export failed', message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setIsImporting(true);
      setDataError(null);
      try {
        const text = await file.text();
        const data = storageService.importFromJSON(text);
        if (!data.portfolios?.length) {
          // A well-formed backup can still hold nothing; saying so beats a click
          // that appears to do nothing at all.
          addNotification({
            type: 'warning',
            title: 'Nothing to import',
            message: 'That backup contains no portfolios.',
          });
          return;
        }
        // Importing a backup again changes nothing, so report both numbers —
        // otherwise a restore that updated everything looks like it did nothing.
        const { added, updated } = importPortfolios(data.portfolios);
        addNotification({
          type: 'success',
          title: 'Import complete',
          message: `${added} portfolio(s) added${updated ? `, ${updated} updated` : ''}.`,
        });
      } catch (err) {
        const message = (err as Error).message || 'The file could not be read.';
        setDataError(`Import failed — ${message}. Nothing was changed.`);
        addNotification({ type: 'error', title: 'Import failed', message });
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  // The confirmation lives in a dialog now (see below) — `window.confirm` blocked the
  // thread, could not be styled, and could not say how much was about to be deleted.
  const handleClearAll = () => {
    clearAll();
    setClearOpen(false);
    addNotification({ type: 'info', title: 'All data cleared' });
  };

  const handleResetDone = () => {
    resetSettings();
    setResetOpen(false);
    addNotification({ type: 'info', title: 'Preferences reset', message: 'Back to the defaults.' });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description="Appearance, the data this browser holds, and what the app is."
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/*
         * Section nav. A horizontally scrollable strip on mobile (a left column has
         * no room there) and a sticky column from `lg` up, so the sections stay one
         * click away while the reader scrolls a long page.
         */}
        <nav aria-label="Settings sections" className="lg:sticky lg:top-6">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:pb-0">
            {SECTIONS.map(({ id, label }) => {
              const current = activeSection === id;
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => goToSection(id)}
                    className={cn(
                      'flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:w-full',
                      current
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6 min-w-0 space-y-6 lg:mt-0">
          {/* ─── Appearance ─────────────────────────────────────────────────── */}
          <section
            id="settings-appearance"
            aria-labelledby="settings-appearance-heading"
            className="scroll-mt-6"
          >
            <h2 id="settings-appearance-heading" className="sr-only">
              Appearance
            </h2>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Theme</CardTitle>
                  <CardDescription>
                    Pick one of the three. The choice applies immediately and is remembered.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/*
                   * A three-way segmented control, not a dropdown: all three choices and
                   * which one is active are visible without opening anything. The value
                   * still writes through useTheme(), so the <html> class, the
                   * colour-scheme and the browser theme colour all follow.
                   */}
                  <Tabs value={theme} onValueChange={(value) => setTheme(value as ThemeValue)}>
                    <TabsList variant="segmented" aria-label="Theme" className="h-12">
                      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                        <TabsTrigger key={value} value={value} className="min-h-11">
                          <Icon aria-hidden="true" className="h-4 w-4" />
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <p role="status" className="text-xs text-muted-foreground">
                    Currently set to{' '}
                    <span className="font-medium text-foreground">{activeTheme.label}</span>. {activeTheme.hint}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Display</CardTitle>
                  <CardDescription>What figures show, and how often prices are re-read.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {/*
                   * The whole row is the control (label → switch by id), so the touch
                   * target is a 56px-tall full-width row rather than the 24px pill.
                   */}
                  <label
                    htmlFor="show-percentages"
                    className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-md px-1 py-2 transition-colors duration-base ease-standard hover:bg-accent/60"
                  >
                    <span className="min-w-0">
                      <span id="show-percentages-label" className="block text-sm font-medium">
                        Show percentages
                      </span>
                      <span id="show-percentages-hint" className="block text-xs text-muted-foreground">
                        Percentage change beside every holding, next to the rupee figure.
                      </span>
                    </span>
                    {/*
                     * The shared primitive draws a 24px pill; the size classes here take
                     * the control to 44px tall (thumb scaled to match) because the
                     * primitive is shared and cannot be resized at its own call site.
                     */}
                    <Switch
                      id="show-percentages"
                      aria-labelledby="show-percentages-label"
                      aria-describedby="show-percentages-hint"
                      checked={settings.showPercentages}
                      onCheckedChange={(v) => updateSettings({ showPercentages: v })}
                      className="h-11 w-20 shrink-0 [&>span]:h-9 [&>span]:w-9 [&>span]:data-[state=checked]:translate-x-10"
                    />
                  </label>

                  <Separator />

                  <div className="space-y-2 py-2">
                    <Label htmlFor="auto-refresh">Auto-refresh interval</Label>
                    <p id="auto-refresh-hint" className="text-xs text-muted-foreground">
                      How often open pages re-read quotes. Disabled stops the polling.
                    </p>
                    <Select
                      value={String(settings.autoRefreshInterval)}
                      onValueChange={(v) =>
                        updateSettings({ autoRefreshInterval: Number(v) as typeof settings.autoRefreshInterval })
                      }
                    >
                      <SelectTrigger
                        id="auto-refresh"
                        aria-describedby="auto-refresh-hint"
                        className="h-11 min-h-11 w-full tabular-nums sm:w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0" className="min-h-11">
                          Disabled
                        </SelectItem>
                        <SelectItem value="30" className="min-h-11">
                          30 seconds
                        </SelectItem>
                        <SelectItem value="60" className="min-h-11">
                          1 minute
                        </SelectItem>
                        <SelectItem value="300" className="min-h-11">
                          5 minutes
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      Preferences only — portfolios are never touched by a reset.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setResetOpen(true)}
                      className="w-full shrink-0 sm:w-auto"
                    >
                      <RotateCcw aria-hidden="true" /> Reset to defaults
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ─── Data ─────────────────────────────────────────────────────────── */}
          <section id="settings-data" aria-labelledby="settings-data-heading" className="scroll-mt-6">
            <h2 id="settings-data-heading" className="sr-only">
              Data
            </h2>
            <Card>
              <CardHeader>
                <CardTitle>Storage &amp; backups</CardTitle>
                <CardDescription>
                  {portfolioLabel} and every setting live in this browser only — nothing is sent anywhere.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Storage used</span>
                    <span className="font-medium tabular-nums">
                      {(storageInfo.used / 1024).toFixed(1)} KB /{' '}
                      {(storageInfo.total / 1024 / 1024).toFixed(0)} MB ({storageInfo.usedPercent}%)
                    </span>
                  </div>
                  <Progress value={storageInfo.usedPercent} className="h-2" />
                </div>

                <Separator />

                {/* Two equal actions, same size and weight — they are a pair. */}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    loading={isExporting}
                    className="flex-1"
                  >
                    <Download aria-hidden="true" /> Export backup
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleImport}
                    loading={isImporting}
                    className="flex-1"
                  >
                    <Upload aria-hidden="true" /> Import backup
                  </Button>
                </div>

                {dataError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-loss/30 bg-loss-light/60 px-3 py-2 text-xs text-loss-dark"
                  >
                    <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{dataError}</span>
                  </p>
                )}

                <Separator />

                {/*
                 * The destructive action sits alone below a rule, in outline with
                 * loss-toned ink rather than a filled button wedged between the
                 * harmless ones — and it asks first (dialog below).
                 */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Clearing removes every portfolio from this browser, including holdings and buy
                    history. It cannot be undone — export a backup first if you might want them back.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setClearOpen(true)}
                    className="w-full shrink-0 border-loss/40 text-loss hover:bg-loss-light hover:text-loss-dark sm:w-auto"
                  >
                    <Trash2 aria-hidden="true" /> Clear all data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ─── About ────────────────────────────────────────────────────────── */}
          <section id="settings-about" aria-labelledby="settings-about-heading" className="scroll-mt-6">
            <h2 id="settings-about-heading" className="sr-only">
              About
            </h2>
            <Card>
              <CardHeader>
                <CardTitle>About this app</CardTitle>
                <CardDescription>
                  {APP_NAME} v{APP_VERSION}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  A client-side Pakistan Stock Exchange portfolio tracker. Every portfolio, setting
                  and notification is stored in this browser’s LocalStorage.
                </p>
                <p className="text-xs">
                  Market data is simulated. For production use, connect a real data provider in{' '}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                    src/services/market/marketDataService.ts
                  </code>
                  .
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      {/* ─── Confirmations ──────────────────────────────────────────────────── */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset preferences?</DialogTitle>
            <DialogDescription>
              Theme, percentage display and the auto-refresh interval go back to their defaults
              (System, on, 1 minute). Your portfolios are untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleResetDone}>
              <RotateCcw aria-hidden="true" /> Reset to defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clear all data?</DialogTitle>
            <DialogDescription>
              This deletes {portfolioLabel} stored in this browser, including every holding and buy
              record. It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="outline"
              onClick={handleClearAll}
              className="border-loss/40 text-loss hover:bg-loss-light hover:text-loss-dark"
            >
              <Trash2 aria-hidden="true" /> Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
