import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarDays, Plus, Trash2, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, forecastDividend } from '@/utils';
import type {
  Portfolio,
  Holding,
  DeclaredDividend,
  DeclaredDividendInput,
} from '@/types';

/**
 * A declared (not yet received) dividend with its owning holding attached, so the
 * calendar can show the symbol and current quantity behind each entry.
 */
type CalendarEntry = DeclaredDividend & { holding: Holding };

/** The soonest relevant date — what the calendar keys the row on. */
function nextDate(d: DeclaredDividend): string | null {
  return d.paymentDate ?? d.exDividendDate ?? d.bookClosureDate ?? d.announcementDate ?? null;
}

function dateLabel(value?: string): string {
  return value ? format(parseISO(value), 'dd MMM yyyy') : '—';
}

/**
 * One holding's estimate from its own dividend history. A forecast is a pattern,
 * never a promise: it is rendered only when a history produced an amount, always
 * under the "Estimate" banner, and never beside a declared row.
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
            ? `around ${format(parseISO(forecast.expectedDate), 'MMM yyyy')} · `
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

/**
 * The portfolio's dividend calendar: declared (user-entered, not yet received)
 * rows with dates and expected income, plus per-holding estimates from each
 * holding's own dividend history. Declared and forecast stay in separate sections
 * and never blur into "paid" — only the received-dividend log records a payout.
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
  const [open, setOpen] = useState(false);
  const [holdingId, setHoldingId] = useState('');
  const [amount, setAmount] = useState('');
  const [announcementDate, setAnnouncementDate] = useState('');
  const [exDividendDate, setExDividendDate] = useState('');
  const [bookClosureDate, setBookClosureDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const declared = useMemo<CalendarEntry[]>(
    () =>
      portfolio.holdings
        .flatMap((h) => (h.declaredDividends ?? []).map((d) => ({ ...d, holding: h })))
        .sort((a, b) => (nextDate(a) ?? '9999').localeCompare(nextDate(b) ?? '9999')),
    [portfolio],
  );

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
    setError(null);
    await onAdd(holdingId, {
      amountPerShare: parsed,
      ...(announcementDate ? { announcementDate } : {}),
      ...(exDividendDate ? { exDividendDate } : {}),
      ...(bookClosureDate ? { bookClosureDate } : {}),
      ...(paymentDate ? { paymentDate } : {}),
    });
    setAmount('');
    setAnnouncementDate('');
    setExDividendDate('');
    setBookClosureDate('');
    setPaymentDate('');
    setHoldingId('');
    setOpen(false);
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Dividend calendar
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Declare dividend
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pb-3">
        {open && (
          <form
            className="space-y-3 rounded-lg border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <Label htmlFor="declaredAnnouncement">Announcement date</Label>
                <Input
                  id="declaredAnnouncement"
                  type="date"
                  className="h-11"
                  value={announcementDate}
                  onChange={(e) => setAnnouncementDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="declaredEx">Ex-dividend date</Label>
                <Input
                  id="declaredEx"
                  type="date"
                  className="h-11"
                  value={exDividendDate}
                  onChange={(e) => setExDividendDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="declaredBook">Book-closure date</Label>
                <Input
                  id="declaredBook"
                  type="date"
                  className="h-11"
                  value={bookClosureDate}
                  onChange={(e) => setBookClosureDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="declaredPayment">Payment date</Label>
                <Input
                  id="declaredPayment"
                  type="date"
                  className="h-11"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Dates are optional — only fill in what the announcement actually states.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save declared dividend</Button>
            </div>
          </form>
        )}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Declared · not yet received
          </h3>
          {declared.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing declared. Add a row when a company you hold announces a payout — it stays
              here, separate from received dividends, until you record the money actually arriving.
            </p>
          ) : (
            <ul className="divide-y">
              {declared.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">
                      {d.holding.symbol}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {d.holding.companyName}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(d.amountPerShare)} per share
                      {d.exDividendDate && <> · ex {dateLabel(d.exDividendDate)}</>}
                      {d.bookClosureDate && <> · book closure {dateLabel(d.bookClosureDate)}</>}
                      {d.paymentDate && <> · pays {dateLabel(d.paymentDate)}</>}
                    </p>
                    {d.announcementDate && (
                      <p className="text-xs text-muted-foreground">
                        Announced {dateLabel(d.announcementDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-right">
                      <span className="block font-mono text-sm font-medium tabular-nums">
                        {formatCurrency(d.holding.shares * d.amountPerShare)}
                      </span>
                      <span className="block text-xs text-muted-foreground">expected</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Remove declared dividend for ${d.holding.symbol}`}
                      onClick={() => onDelete(d.holding.id, d.id)}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

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
    </Card>
  );
}
