import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Sparkles, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate, forecastDividend } from '@/utils';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  dayKey,
  todayKey,
  eventTotal,
  groupDividendsByDate,
  type DividendCalendarEvent,
} from '@/utils/dividendCalendar';
import type {
  Portfolio,
  Holding,
  DeclaredDividendInput,
} from '@/types';

/**
 * One holding's estimate from its own dividend history. A forecast is a pattern,
 * never a promise: it is rendered only when a history produced an amount, always
 * under the "Estimate" banner, and never on the grid (estimates are guesses, not
 * dates).
 */
function DividendForecastRow({ holding }: { holding: Holding }) {
  const forecast = forecastDividend(holding.dividendsReceived ?? []);

  if (forecast.expectedAmountPerShare == null) return null;

  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold text-muted-foreground">
          {holding.symbol}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{holding.companyName}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {forecast.expectedDate
            ? `around ${format(new Date(`${forecast.expectedDate}T00:00:00`), 'MMM yyyy')} · `
            : ''}
          {formatCurrency(forecast.expectedAmountPerShare)} per share · {forecast.basedOn}
        </p>
      </div>
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        estimate
      </span>
    </li>
  );
}

/** A single calendar day cell: date number, dividend markers, hover summary, tap to open. */
function DayCell({
  date,
  inMonth,
  events,
  onSelect,
}: {
  date: Date;
  inMonth: boolean;
  events: DividendCalendarEvent[];
  onSelect: (key: string) => void;
}) {
  const key = dayKey(date);
  const isToday = key === todayKey();
  const has = events.length > 0;
  const hasDeclared = events.some((e) => e.kind === 'declared');
  const hasReceived = events.some((e) => e.kind === 'received');

  const label = has
    ? `${date.getDate()} — ${events.length} dividend${events.length === 1 ? '' : 's'}: ${events
        .map((e) => e.holding.symbol)
        .join(', ')}`
    : String(date.getDate());

  const button = (
    <button
      type="button"
      onClick={() => onSelect(key)}
      aria-label={label}
      className={cn(
        'flex h-10 w-full flex-col items-center justify-center gap-0.5 rounded-md text-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        !inMonth && 'text-muted-foreground/50',
        // A day with a dividend is highlighted by its whole cell, not just a dot.
        // Today keeps its accent; otherwise declared (upcoming) gets a primary
        // tint and received-only (paid) a muted tint, each with an inset ring.
        isToday
          ? 'bg-accent font-semibold text-accent-foreground'
          : hasDeclared
            ? 'bg-primary/15 ring-1 ring-inset ring-primary/50'
            : hasReceived
              ? 'bg-muted ring-1 ring-inset ring-border'
              : '',
      )}
    >
      <span className={cn('leading-none', (isToday || hasDeclared) && 'font-semibold')}>
        {date.getDate()}
      </span>
      {has ? (
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {events.slice(0, 3).map((e, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                e.kind === 'declared' ? 'bg-primary' : 'bg-muted-foreground/60',
              )}
            />
          ))}
          {events.length > 3 && (
            <span className="text-[9px] leading-none text-muted-foreground">+{events.length - 3}</span>
          )}
        </span>
      ) : (
        <span className="h-1.5" aria-hidden="true" />
      )}
    </button>
  );

  if (!has) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" align="center" className="max-w-60">
        <p className="text-xs font-medium">{formatDate(key, 'long')}</p>
        <ul className="mt-1 space-y-1">
          {events.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-mono font-semibold">{e.holding.symbol}</span>
              <span className="text-muted-foreground">
                {e.kind === 'declared' ? 'declared' : 'paid'} · {formatCurrency(eventTotal(e))}
              </span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The portfolio's dividend calendar — a standard month grid. Declared (upcoming)
 * dividends land on their payment date and received (paid) dividends on their
 * date; hovering a day shows a summary and tapping it opens the detail modal.
 * Declared rows without a payment date and per-holding estimates sit below the
 * grid, never on it.
 */
export function DividendCalendar({
  portfolio,
  onAdd,
  onDelete,
}: {
  portfolio: Portfolio;
  onAdd: (holdingId: string, input: Omit<DeclaredDividendInput, 'holdingId'>) => Promise<void>;
  onDelete: (holdingId: string, dividendId: string) => Promise<void>;
}) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [holdingId, setHoldingId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => groupDividendsByDate(portfolio.holdings), [portfolio]);
  const weeks = useMemo(
    () => buildMonthGrid(viewDate.getFullYear(), viewDate.getMonth()),
    [viewDate],
  );
  const selectedEvents = selectedDay ? (grouped.byDate.get(selectedDay) ?? []) : [];

  const prevMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };
  const goNext = () => {
    if (!grouped.nextDate) return;
    const [y, m] = grouped.nextDate.split('-').map(Number);
    setViewDate(new Date(y, m - 1, 1));
  };

  const openAdd = (prefillDate: string | null = null) => {
    setHoldingId('');
    setAmount('');
    setPaymentDate(prefillDate ?? '');
    setError(null);
    setSelectedDay(null);
    setAddOpen(true);
  };

  const submit = async () => {
    const parsed = Number(amount);
    if (!holdingId) {
      setError('Choose a holding first');
      return;
    }
    if (amount.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setError('Amount per share must be 0 or more');
      return;
    }
    if (!paymentDate) {
      setError('Payment date is required');
      return;
    }
    setError(null);
    await onAdd(holdingId, { amountPerShare: parsed, paymentDate });
    setAddOpen(false);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Dividend calendar
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => openAdd()}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Declare dividend
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        {/* Month navigation */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">
              {format(viewDate, 'MMMM yyyy')}
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={nextMonth} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={!grouped.nextDate}
              className="gap-1"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Next dividend
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" /> Declared (upcoming)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/60" aria-hidden="true" /> Received (paid)
          </span>
        </div>

        {/* Grid */}
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                {w}
              </div>
            ))}
            {weeks.flat().map((date) => {
              const key = dayKey(date);
              return (
                <DayCell
                  key={key}
                  date={date}
                  inMonth={date.getMonth() === viewDate.getMonth()}
                  events={grouped.byDate.get(key) ?? []}
                  onSelect={setSelectedDay}
                />
              );
            })}
          </div>
        </TooltipProvider>

        {/* Declared rows without a payment date */}
        {grouped.undated.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Declared · no payment date
            </h3>
            <p className="text-xs text-muted-foreground">
              These have no payment date, so they can't sit on the grid. Re-add them with a date to place them.
            </p>
            <ul className="divide-y">
              {grouped.undated.map(({ dividend, holding }) => (
                <li key={dividend.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">
                      {holding.symbol}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {holding.companyName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(dividend.amountPerShare)} per share
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Remove declared dividend for ${holding.symbol}`}
                    onClick={() => onDelete(holding.id, dividend.id)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pattern-based estimates stay off the grid */}
        <section>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Estimate
          </h3>
          <p className="text-xs text-muted-foreground">
            Pattern-based, not confirmed — a company that paid before is not promising to pay again.
          </p>
          <ul className="divide-y">
            {portfolio.holdings.map((h) => (
              <DividendForecastRow key={h.id} holding={h} />
            ))}
          </ul>
        </section>
      </CardContent>

      {/* Add / declare dividend */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Declare dividend</DialogTitle>
            <DialogDescription>
              Record a company's announced payout. The calendar keys on the payment date.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="declaredHolding">Holding *</Label>
              <select
                id="declaredHolding"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={holdingId}
                onChange={(e) => setHoldingId(e.target.value)}
              >
                <option value="">Select a holding…</option>
                {portfolio.holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.symbol} — {h.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="declaredAmount">Amount per share (PKR) *</Label>
              <Input
                id="declaredAmount"
                type="number"
                step="0.01"
                className="h-11 tabular-nums"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="declaredPayment">Payment date *</Label>
              <Input
                id="declaredPayment"
                type="date"
                className="h-11"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save declared dividend</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Day detail modal */}
      <Dialog open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDay ? formatDate(selectedDay, 'long') : ''}</DialogTitle>
            <DialogDescription>
              {selectedEvents.length} dividend{selectedEvents.length === 1 ? '' : 's'} on this date
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {selectedEvents.map((event, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {event.holding.symbol}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {event.holding.companyName}
                    </span>
                  </span>
                  <Badge variant={event.kind === 'declared' ? 'default' : 'secondary'}>
                    {event.kind === 'declared' ? 'Declared' : 'Received'}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatCurrency(event.dividend.amountPerShare)} / share
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(eventTotal(event))}
                  </span>
                </div>
                {event.kind === 'declared' && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        void onDelete(event.holding.id, event.dividend.id);
                        setSelectedDay(null);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => openAdd(selectedDay)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Declare on this date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
