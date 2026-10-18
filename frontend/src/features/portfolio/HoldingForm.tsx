import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompanySearch } from '@/components/shared';
import { Pencil, ShoppingCart, Trash2, TrendingDown, Layers } from 'lucide-react';
import {
  holdingSchema, buySchema, sellSchema, tradeSchema, normalizeSector, sectorForSymbol, isCanonicalSector, displaySector,
  mostRecentTradingDay, blendPurchase, positionFromBuys, formatCurrency,
  type HoldingFormValues, type BuyFormValues, type SellFormValues,
} from '@/utils';
import { PSX_SECTORS, EARLIEST_PURCHASE_DATE } from '@/constants';
import { useCompanySearch, useStockQuote } from '@/hooks';
import type { PSXCompany, BuyRecord, SellRecord, CorporateAction, CorporateActionInput, CorporateActionType } from '@/types';

/** The position a buy would be blended into. */
export interface PositionSnapshot {
  symbol: string;
  shares: number;
  averagePurchasePrice: number;
}

/**
 * Register options for a numeric field.
 *
 * `valueAsNumber` alone turns an empty field into `NaN`, and zod then reports
 * "Expected number, received nan" — a message no one should ever read. It also
 * takes precedence over `setValueAs`, so the conversion is done here instead: an
 * empty field arrives as `undefined`, which makes the schema's own
 * "… is required" the message that lands next to the field.
 */
const asNumber = {
  setValueAs: (value: unknown) => (value === '' || value === null ? undefined : Number(value)),
} as const;

interface HoldingFormProps {
  defaultValues?: Partial<HoldingFormValues>;
  onSubmit: (values: HoldingFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
  /** Edit dialog only. When given, the dialog offers "Buy more". */
  position?: PositionSnapshot;
  onBuy?: (values: BuyFormValues) => void;
  /** Edit dialog only: the position's purchases, oldest first. */
  buys?: BuyRecord[];
  /** Edit dialog only: correct a logged purchase's quantity and price. */
  onUpdateBuy?: (buyId: string, patch: { shares: number; pricePerShare: number }) => void;
  /** Edit dialog only: remove a logged purchase. */
  onDeleteBuy?: (buyId: string) => void;
  /** Edit dialog only: the position's sales, oldest first. */
  sells?: SellRecord[];
  /** Edit dialog only: record a sale of part of the position. */
  onSell?: (values: SellFormValues) => void;
  /** Edit dialog only: correct a logged sale's quantity, price and fees (date is fixed). */
  onUpdateSell?: (sellId: string, patch: { shares: number; pricePerShare: number; fees: number }) => void;
  /** Edit dialog only: remove a logged sale. */
  onDeleteSell?: (sellId: string) => void;
  /** Edit dialog only: the position's corporate actions, oldest first. */
  actions?: CorporateAction[];
  /** Edit dialog only: apply a corporate action (split/bonus/rights). */
  onAddAction?: (input: Omit<CorporateActionInput, 'holdingId'>) => void;
  /** Edit dialog only: undo a corporate action. */
  onDeleteAction?: (actionId: string) => void;
}

/**
 * Every purchase behind a position, oldest first, as the transactions that make
 * it up — each one correctable, and removable.
 *
 * A trade's quantity and price are what the position's average is derived from,
 * so correcting or removing one re-prices the whole position from its own
 * history: the numbers below and the average they add up to cannot disagree.
 *
 * A table where there is room for one, and a card per purchase on a phone —
 * four columns plus two actions do not fit 390px, and a table that scrolls
 * sideways inside a dialog is a worse answer than a card.
 */
function BuyHistory({
  symbol, buys, onSave, onDelete,
}: {
  symbol: string;
  buys: BuyRecord[];
  onSave: (buyId: string, patch: { shares: number; pricePerShare: number }) => void;
  onDelete: (buyId: string) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; shares: string; price: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const position = positionFromBuys(buys);
  const cost = buys.reduce((sum, b) => sum + b.shares * b.pricePerShare, 0);
  const label = (b: BuyRecord) => `${format(parseISO(b.date), 'dd MMM yyyy')} of ${b.shares.toLocaleString()} shares`;
  const isOpening = (b: BuyRecord) => b.kind === 'opening';

  const startEdit = (b: BuyRecord) => {
    setConfirming(null);
    setEditing({ id: b.id, shares: String(b.shares), price: String(b.pricePerShare) });
    setError(null);
  };

  const save = () => {
    if (!editing) return;
    const shares = Number(editing.shares);
    const price = Number(editing.price);
    // Say which field is wrong in words a user would use: the schema's "expected
    // number, received nan" is not something to put in front of them.
    if (editing.shares.trim() === '' || !Number.isFinite(shares)) {
      setError('Quantity must be a number, e.g. 100');
      return;
    }
    if (editing.price.trim() === '' || !Number.isFinite(price)) {
      setError('Price must be a number, e.g. 250.50');
      return;
    }
    const parsed = tradeSchema.safeParse({ shares, pricePerShare: price });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the quantity and price');
      return;
    }
    onSave(editing.id, parsed.data);
    setEditing(null);
    setError(null);
  };

  /**
   * The two actions on a logged purchase. 44x44 on both surfaces: a table row is
   * not an excuse to shrink a target, and neither is a dialog.
   */
  const actions = (b: BuyRecord) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit trade ${label(b)}`}
        onClick={() => startEdit(b)}
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label={`Delete trade ${label(b)}`}
        onClick={() => { setEditing(null); setConfirming(b.id); }}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );

  /**
   * The inline editor. Both surfaces are in the DOM (one hidden by a media
   * query, as the holdings table does), so the field ids carry the surface to
   * keep them unique in the document.
   */
  const editor = (b: BuyRecord, scope: 'table' | 'card') => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`trade-shares-${b.id}-${scope}`}>Quantity</Label>
          <Input
            id={`trade-shares-${b.id}-${scope}`}
            type="number"
            step="1"
            className="h-11 tabular-nums"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `trade-error-${b.id}-${scope}` : undefined}
            value={editing?.shares ?? ''}
            onChange={(e) => setEditing(editing ? { ...editing, shares: e.target.value } : editing)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`trade-price-${b.id}-${scope}`}>Price (PKR)</Label>
          <Input
            id={`trade-price-${b.id}-${scope}`}
            type="number"
            step="0.01"
            className="h-11 tabular-nums"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `trade-error-${b.id}-${scope}` : undefined}
            value={editing?.price ?? ''}
            onChange={(e) => setEditing(editing ? { ...editing, price: e.target.value } : editing)}
          />
        </div>
      </div>
      {error && <p id={`trade-error-${b.id}-${scope}`} className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setEditing(null); setError(null); }}>
          Cancel
        </Button>
        <Button type="button" onClick={save}>
          Save trade
        </Button>
      </div>
    </div>
  );

  /**
   * Destructive actions get confirmed — never a silent delete. The last
   * purchase is the position itself, so it says plainly what it takes with it.
   */
  const confirmDelete = (b: BuyRecord) => {
    const last = buys.length <= 1;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {last ? 'Delete the last purchase?' : 'Delete this purchase?'}{' '}
          <span className="text-muted-foreground">
            {format(parseISO(b.date), 'dd MMM yyyy')} · {b.shares.toLocaleString()} @ {formatCurrency(b.pricePerShare)}
            {last && ` — ${symbol} has no other purchases, so it leaves this portfolio`}
          </span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
            Keep
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => { onDelete(b.id); setConfirming(null); }}
          >
            {last ? 'Remove holding' : 'Delete'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ShoppingCart className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Buy transactions</p>
            <p className="text-xs text-muted-foreground">
              {buys.length} {buys.length === 1 ? 'transaction that makes up' : 'transactions that make up'} this holding
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {position.shares.toLocaleString()} shares at {formatCurrency(position.averagePurchasePrice)} average
        </p>
      </div>

      {/* Room for a table: one row per purchase, which is the whole point. */}
      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Shares</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Buy price</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Cost</th>
              <th scope="col" className="w-[104px] px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {buys.map((b) => (
              <tr key={b.id} className={editing?.id === b.id || confirming === b.id ? 'bg-muted/40' : undefined}>
                {editing?.id === b.id ? (
                  <td colSpan={5} className="px-3 py-3">{editor(b, 'table')}</td>
                ) : confirming === b.id ? (
                  <td colSpan={5} className="px-3 py-3">{confirmDelete(b)}</td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {format(parseISO(b.date), 'dd MMM yyyy')}
                      {isOpening(b) && (
                        <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">opening</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.shares.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(b.pricePerShare)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(b.totalCost)}</td>
                    <td className="px-3 py-2.5">{actions(b)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-border bg-muted/20">
            <tr>
              <td className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</td>
              <td className="px-3 py-2 text-right text-xs font-medium tabular-nums">{position.shares.toLocaleString()}</td>
              <td className="px-3 py-2 text-right text-xs font-medium tabular-nums text-muted-foreground">
                {formatCurrency(position.averagePurchasePrice)}
              </td>
              <td className="px-3 py-2 text-right text-xs font-medium tabular-nums">{formatCurrency(cost)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* A phone gets one card per purchase instead of a table that scrolls. */}
      <ul className="space-y-2 sm:hidden">
        {buys.map((b) => (
          <li key={b.id} className="rounded-lg border border-border">
            {editing?.id === b.id ? (
              <div className="p-3">{editor(b, 'card')}</div>
            ) : confirming === b.id ? (
              <div className="p-3">{confirmDelete(b)}</div>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {format(parseISO(b.date), 'dd MMM yyyy')}
                    {isOpening(b) && (
                      <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">opening</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {b.shares.toLocaleString()} @ {formatCurrency(b.pricePerShare)} · total {formatCurrency(b.totalCost)}
                  </p>
                </div>
                {actions(b)}
              </div>
            )}
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 bg-muted/20 p-3 text-xs font-medium">
          <span className="uppercase tracking-wide text-muted-foreground">Total</span>
          <span className="tabular-nums">
            {position.shares.toLocaleString()} shares · {formatCurrency(cost)}
          </span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Every sale behind a position, oldest first, as the transactions that reduced
 * it — each correctable and removable. A sale's own realized P/L is not shown on
 * its row: it depends on the running average at the moment of the sale, which is
 * the whole ledger's arithmetic (surfaced on the holdings table), not a row's.
 */
function SellHistory({
  symbol, sells, onSave, onDelete,
}: {
  symbol: string;
  sells: SellRecord[];
  onSave: (sellId: string, patch: { shares: number; pricePerShare: number; fees: number }) => void;
  onDelete: (sellId: string) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; shares: string; price: string; fees: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalShares = sells.reduce((sum, s) => sum + s.shares, 0);
  const label = (s: SellRecord) => `${format(parseISO(s.date), 'dd MMM yyyy')} of ${s.shares.toLocaleString()} shares`;

  const startEdit = (s: SellRecord) => {
    setConfirming(null);
    setEditing({ id: s.id, shares: String(s.shares), price: String(s.pricePerShare), fees: String(s.fees ?? 0) });
    setError(null);
  };

  const save = () => {
    if (!editing) return;
    const shares = Number(editing.shares);
    const price = Number(editing.price);
    const fees = editing.fees.trim() === '' ? 0 : Number(editing.fees);
    if (editing.shares.trim() === '' || !Number.isFinite(shares)) {
      setError('Quantity must be a number, e.g. 100');
      return;
    }
    if (editing.price.trim() === '' || !Number.isFinite(price)) {
      setError('Price must be a number, e.g. 250.50');
      return;
    }
    if (!Number.isFinite(fees)) {
      setError('Fees must be a number');
      return;
    }
    const parsed = sellSchema.omit({ date: true }).safeParse({ shares, pricePerShare: price, fees });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the quantity, price and fees');
      return;
    }
    onSave(editing.id, parsed.data);
    setEditing(null);
    setError(null);
  };

  const actions = (s: SellRecord) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Edit sale ${label(s)}`}
        onClick={() => startEdit(s)}
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:text-destructive"
        aria-label={`Delete sale ${label(s)}`}
        onClick={() => { setEditing(null); setConfirming(s.id); }}
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </Button>
    </div>
  );

  const editor = (s: SellRecord, scope: 'table' | 'card') => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`sell-shares-${s.id}-${scope}`}>Quantity</Label>
          <Input
            id={`sell-shares-${s.id}-${scope}`}
            type="number"
            step="1"
            className="h-11 tabular-nums"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `sell-error-${s.id}-${scope}` : undefined}
            value={editing?.shares ?? ''}
            onChange={(e) => setEditing(editing ? { ...editing, shares: e.target.value } : editing)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sell-price-${s.id}-${scope}`}>Price (PKR)</Label>
          <Input
            id={`sell-price-${s.id}-${scope}`}
            type="number"
            step="0.01"
            className="h-11 tabular-nums"
            aria-invalid={error ? true : undefined}
            value={editing?.price ?? ''}
            onChange={(e) => setEditing(editing ? { ...editing, price: e.target.value } : editing)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`sell-fees-${s.id}-${scope}`}>Fees (PKR)</Label>
          <Input
            id={`sell-fees-${s.id}-${scope}`}
            type="number"
            step="0.01"
            className="h-11 tabular-nums"
            value={editing?.fees ?? ''}
            onChange={(e) => setEditing(editing ? { ...editing, fees: e.target.value } : editing)}
          />
        </div>
      </div>
      {error && <p id={`sell-error-${s.id}-${scope}`} className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => { setEditing(null); setError(null); }}>
          Cancel
        </Button>
        <Button type="button" onClick={save}>
          Save sale
        </Button>
      </div>
    </div>
  );

  const confirmDelete = (s: SellRecord) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">
        Delete this sale?{' '}
        <span className="text-muted-foreground">
          {format(parseISO(s.date), 'dd MMM yyyy')} · {s.shares.toLocaleString()} @ {formatCurrency(s.pricePerShare)}
          {' '}— {symbol} will gain these shares back.
        </span>
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
          Keep
        </Button>
        <Button type="button" variant="destructive" onClick={() => { onDelete(s.id); setConfirming(null); }}>
          Delete
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <TrendingDown className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Sell transactions</p>
            <p className="text-xs text-muted-foreground">
              {sells.length} {sells.length === 1 ? 'sale' : 'sales'} · {totalShares.toLocaleString()} shares sold
            </p>
          </div>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Date</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Shares</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Sell price</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Fees</th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Proceeds</th>
              <th scope="col" className="w-[104px] px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sells.map((s) => (
              <tr key={s.id} className={editing?.id === s.id || confirming === s.id ? 'bg-muted/40' : undefined}>
                {editing?.id === s.id ? (
                  <td colSpan={6} className="px-3 py-3">{editor(s, 'table')}</td>
                ) : confirming === s.id ? (
                  <td colSpan={6} className="px-3 py-3">{confirmDelete(s)}</td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-3 py-2.5">{format(parseISO(s.date), 'dd MMM yyyy')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{s.shares.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.pricePerShare)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.fees ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(s.shares * s.pricePerShare)}</td>
                    <td className="px-3 py-2.5">{actions(s)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 sm:hidden">
        {sells.map((s) => (
          <li key={s.id} className="rounded-lg border border-border">
            {editing?.id === s.id ? (
              <div className="p-3">{editor(s, 'card')}</div>
            ) : confirming === s.id ? (
              <div className="p-3">{confirmDelete(s)}</div>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{format(parseISO(s.date), 'dd MMM yyyy')}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {s.shares.toLocaleString()} @ {formatCurrency(s.pricePerShare)}
                    {' '}· fees {formatCurrency(s.fees ?? 0)} · {formatCurrency(s.shares * s.pricePerShare)}
                  </p>
                </div>
                {actions(s)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Corporate actions (splits, bonus shares, rights) applied to a position.
 *
 * An action adjusts quantity and cost basis at its date and is folded into the
 * ledger replay; deleting it undoes the adjustment (the whole position is
 * re-derived from the log). The ratio is entered as a "new : old" pair so the
 * arithmetic stays transparent, and the helper text states the invariant each
 * action must preserve.
 */
function CorporateActionsHistory({
  actions,
  onAdd,
  onDelete,
}: {
  actions: CorporateAction[];
  onAdd: (input: Omit<CorporateActionInput, 'holdingId'>) => void;
  onDelete: (actionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CorporateActionType>('split');
  const [date, setDate] = useState(format(mostRecentTradingDay(), 'yyyy-MM-dd'));
  const [numerator, setNumerator] = useState('');
  const [denominator, setDenominator] = useState('');
  const [price, setPrice] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const describe = (a: CorporateAction): string => {
    if (a.type === 'split') return `${a.ratio}× split`;
    if (a.type === 'bonus') return `${Math.round(a.ratio * 100)}% bonus`;
    return `${a.ratio} new per held @ ${formatCurrency(a.price ?? 0)}`;
  };

  const labels: Record<CorporateActionType, { n: string; d: string }> = {
    split: { n: 'Shares after', d: 'Shares before' },
    bonus: { n: 'Bonus shares', d: 'per shares held' },
    rights: { n: 'New shares', d: 'per shares held' },
  };

  const submit = () => {
    const n = Number(numerator);
    const d = Number(denominator);
    if (!date) return setError('Choose a date');
    if (numerator.trim() === '' || !Number.isFinite(n) || n <= 0) {
      return setError('Enter a whole number greater than 0');
    }
    if (denominator.trim() === '' || !Number.isFinite(d) || d <= 0) {
      return setError('Enter a whole number greater than 0');
    }
    const ratio = n / d;
    let priceValue: number | undefined;
    if (type === 'rights') {
      const p = Number(price);
      if (price.trim() === '' || !Number.isFinite(p) || p < 0) {
        return setError('Subscription price must be 0 or more');
      }
      priceValue = p;
    }
    setError(null);
    onAdd({ type, date, ratio, ...(priceValue !== undefined ? { price: priceValue } : {}) });
    setOpen(false);
    setNumerator('');
    setDenominator('');
    setPrice('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Layers className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Corporate actions</p>
            <p className="text-xs text-muted-foreground">
              {actions.length} {actions.length === 1 ? 'action' : 'actions'} · splits, bonus, rights
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setOpen((v) => !v);
            setError(null);
          }}
        >
          {open ? 'Close' : 'Add action'}
        </Button>
      </div>

      {open && (
        <form
          className="space-y-3 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="actionType">Type</Label>
              <select
                id="actionType"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as CorporateActionType)}
              >
                <option value="split">Stock split</option>
                <option value="bonus">Bonus shares</option>
                <option value="rights">Rights issue</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="actionDate">Date</Label>
              <Input
                id="actionDate"
                type="date"
                className="h-11"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="actionNum">{labels[type].n}</Label>
              <Input
                id="actionNum"
                type="number"
                step="1"
                className="h-11 tabular-nums"
                value={numerator}
                onChange={(e) => setNumerator(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="actionDen">{labels[type].d}</Label>
              <Input
                id="actionDen"
                type="number"
                step="1"
                className="h-11 tabular-nums"
                value={denominator}
                onChange={(e) => setDenominator(e.target.value)}
              />
            </div>
            {type === 'rights' && (
              <div className="space-y-1.5">
                <Label htmlFor="actionPrice">Subscription price (PKR)</Label>
                <Input
                  id="actionPrice"
                  type="number"
                  step="0.01"
                  className="h-11 tabular-nums"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {type === 'split' && 'A 2:1 split doubles shares and halves the average cost — totals stay the same.'}
            {type === 'bonus' && 'Bonus shares raise the quantity and lower the average, leaving cost basis unchanged.'}
            {type === 'rights' && 'Rights add shares at the subscription price you paid.'}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Apply action</Button>
          </div>
        </form>
      )}

      {actions.length > 0 && (
        <ul className="divide-y">
          {actions.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2">
              {confirming === a.id ? (
                <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">Undo this {describe(a)}?</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        onDelete(a.id);
                        setConfirming(null);
                      }}
                    >
                      Undo
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{a.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(a.date), 'dd MMM yyyy')} · {describe(a)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Undo ${describe(a)}`}
                    onClick={() => setConfirming(a.id)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The date field, shared by both modes.
 *
 * A holding can't have been bought in the future, and PSX does not trade at the
 * weekend — those days stay on the calendar (the grid reads wrong without them)
 * but are unselectable and muted. A buy uses the same control, so neither path
 * can record a purchase on a day the exchange was shut.
 */
function TradingDateField({
  id, label, value, error, hint, onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  onChange: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : new Date();
  const current = isValid(parsed) ? parsed : new Date();

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {/* Text field + calendar button on the right. The typed value stays an
          ISO date string (what the schema and the store expect); the field
          just *shows* it in a readable format. */}
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <Input
            id={id}
            readOnly
            value={format(current, 'dd MMM yyyy')}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
            className="h-11 cursor-pointer pr-11"
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Choose ${label.replace(' *', '').toLowerCase()}`}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <CalendarIcon aria-hidden="true" className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            autoFocus
            // Month + year dropdowns: a purchase can be years back, and stepping
            // there one arrow-click at a time is no way to enter a date.
            captionLayout="dropdown"
            startMonth={EARLIEST_PURCHASE_DATE}
            endMonth={new Date()}
            selected={current}
            defaultMonth={current}
            disabled={[{ after: new Date() }, { dayOfWeek: [0, 6] }]}
            onSelect={(date) => {
              if (!date) return;
              onChange(format(date, 'yyyy-MM-dd'));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function HoldingForm({
  defaultValues, onSubmit, onCancel, isEditing, position, onBuy, buys, onUpdateBuy, onDeleteBuy,
  sells, onSell, onUpdateSell, onDeleteSell,
  actions, onAddAction, onDeleteAction,
}: HoldingFormProps) {
  // 'edit' is the form as it was; 'buy' records a second purchase of the same
  // stock and blends it into the position; 'sell' records a sale against it.
  const [mode, setMode] = useState<'edit' | 'buy' | 'sell'>('edit');
  const buyOpen = mode === 'buy';
  const sellOpen = mode === 'sell';

  const { register, handleSubmit, control, setValue, watch, formState: { errors, isSubmitting } } = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: {
      // The most recent session by default, so the field is never empty on a new
      // holding — and never proposes a weekend, which the calendar below refuses.
      purchaseDate: format(mostRecentTradingDay(), 'yyyy-MM-dd'),
      // An empty select is `''`, not `undefined`: zod's message for a missing
      // string is "Sector is required" rather than its bare "Required".
      sector: '',
      ...defaultValues,
    },
  });

  // Editing a purchase re-derives the position from the log, so the edit form's
  // own quantity/average have to follow the live values — otherwise a later
  // "Save Changes" would write the pre-edit numbers back over the derivation.
  useEffect(() => {
    if (!position) return;
    setValue('shares', position.shares);
    setValue('averagePurchasePrice', position.averagePurchasePrice);
  }, [position?.shares, position?.averagePurchasePrice, setValue]);

  const buyForm = useForm<BuyFormValues>({
    resolver: zodResolver(buySchema),
    defaultValues: {
      // A buy is usually today, and today may not be a session.
      date: format(mostRecentTradingDay(), 'yyyy-MM-dd'),
    },
  });

  // The live quote is the price this buy most plausibly happened at, and it is
  // fetched only while buy mode is open (one cached request for the symbol the
  // page already quotes). The hint below and the field read this same value in
  // the same render, so the price they state is the price that lands.
  const { data: quote } = useStockQuote(buyOpen || sellOpen ? position?.symbol : undefined);
  const livePrice =
    quote && quote.priceAvailable !== false && Number.isFinite(quote.currentPrice) && quote.currentPrice > 0
      ? quote.currentPrice
      : null;
  // A quote that refreshes must not overwrite a price the user typed: pre-fill
  // only while the field is untouched.
  const priceTouched = buyForm.formState.dirtyFields.pricePerShare;
  useEffect(() => {
    if (!buyOpen || livePrice == null || priceTouched) return;
    buyForm.setValue('pricePerShare', livePrice);
  }, [buyOpen, livePrice, priceTouched, buyForm]);

  const sellForm = useForm<SellFormValues>({
    resolver: zodResolver(sellSchema),
    defaultValues: {
      date: format(mostRecentTradingDay(), 'yyyy-MM-dd'),
      fees: 0,
    },
  });

  // Same pre-fill as the buy price: the live quote is the price this sale most
  // plausibly happened at, and it must not overwrite a price the user typed.
  const sellPriceTouched = sellForm.formState.dirtyFields.pricePerShare;
  useEffect(() => {
    if (!sellOpen || livePrice == null || sellPriceTouched) return;
    sellForm.setValue('pricePerShare', livePrice);
  }, [sellOpen, livePrice, sellPriceTouched, sellForm]);

  const handleCompanySelect = (company: PSXCompany) => {
    setValue('companyName', company.name);
    setValue('symbol', company.symbol);
    // Scraped sectors arrive in PSX's own casing ('FERTILIZER'), which the
    // Title Case picker cannot match — Radix Select compares values exactly.
    // Map it to the canonical list; when the provider has no sector at all
    // (older scraper builds, untracked symbols), fall back to the curated list
    // by symbol. Only if both miss does the user pick one manually.
    setValue('sector', normalizeSector(company.sector) ?? sectorForSymbol(company.symbol) ?? '');
  };

  // Typing a ticker fills the company and sector too, so the manual path — and the
  // edit dialog, which has no search box — behaves like picking from search.
  const symbolValue = watch('symbol') ?? '';
  const { data: symbolMatches = [] } = useCompanySearch(symbolValue);
  const tickerMatch = symbolMatches.find(
    (c) => c.symbol.toUpperCase() === symbolValue.trim().toUpperCase(),
  );

  useEffect(() => {
    if (!tickerMatch) return;
    setValue('companyName', tickerMatch.name);
    setValue('sector', normalizeSector(tickerMatch.sector) ?? sectorForSymbol(tickerMatch.symbol) ?? '');
  }, [tickerMatch?.symbol, tickerMatch?.name, tickerMatch?.sector, setValue]);

  // What the position becomes if this buy is confirmed — computed with the same
  // helper the store uses, so the preview cannot disagree with the result.
  const buyShares = buyForm.watch('shares');
  const buyPrice = buyForm.watch('pricePerShare');
  const preview =
    position && Number.isFinite(buyShares) && buyShares > 0 && Number.isFinite(buyPrice) && buyPrice > 0
      ? blendPurchase(position, { shares: buyShares, pricePerShare: buyPrice })
      : null;

  // The transaction's own outlay, live as the two fields are typed — the total
  // that will leave the account if this buy is confirmed. No fee field exists in
  // the data model, so this is Qty × Price; a fee is not silently invented.
  const buyTotal =
    Number.isFinite(buyShares) && buyShares > 0 && Number.isFinite(buyPrice) && buyPrice > 0
      ? buyShares * buyPrice
      : null;

  const submitBuy = buyForm.handleSubmit((values) => onBuy?.(values));

  const submitSell = sellForm.handleSubmit((values) => onSell?.(values));

  // What this sale realizes if confirmed — the same arithmetic the ledger replay
  // uses: proceeds above (or below) the weighted cost of the shares sold, less
  // fees. Shown as a live preview so the number is the one that will land.
  const sellShares = sellForm.watch('shares');
  const sellPrice = sellForm.watch('pricePerShare');
  const sellFees = sellForm.watch('fees') ?? 0;
  const sellPreview =
    position && Number.isFinite(sellShares) && sellShares > 0 && Number.isFinite(sellPrice) && sellPrice >= 0
      ? {
          remaining: position.shares - sellShares,
          realized: (sellPrice - position.averagePurchasePrice) * sellShares - (Number.isFinite(sellFees) ? sellFees : 0),
          proceeds: sellShares * sellPrice,
        }
      : null;

  /** The read-only restatement of a position's identity while buying. */
  const positionSummary = position && (
    <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium">
        {position.symbol}
        {defaultValues?.companyName ? ` · ${defaultValues.companyName}` : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        Currently {position.shares.toLocaleString()} {position.shares === 1 ? 'share' : 'shares'} at{' '}
        {formatCurrency(position.averagePurchasePrice)} average.
      </p>
    </div>
  );

  return (
    <form onSubmit={buyOpen ? submitBuy : sellOpen ? submitSell : handleSubmit(onSubmit)} className="space-y-4">
      {/* Every control is a full 44px on phones and the desktop 40px from sm up:
          a thumb needs the height, a mouse does not. */}
      {buyOpen ? (
        <>
          {positionSummary}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="buyShares">Quantity to buy *</Label>
              <Input
                id="buyShares"
                type="number"
                step="1"
                placeholder="How many shares"
                className="h-11 tabular-nums"
                aria-invalid={buyForm.formState.errors.shares ? true : undefined}
                aria-describedby={buyForm.formState.errors.shares ? 'buyShares-error' : undefined}
                {...buyForm.register('shares', asNumber)}
              />
              {buyForm.formState.errors.shares && (
                <p id="buyShares-error" className="text-xs text-destructive">{buyForm.formState.errors.shares.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyPrice">Buy price (PKR) *</Label>
              <Input
                id="buyPrice"
                type="number"
                step="0.01"
                // Deliberately not a number: a placeholder is not a value, and a
                // price-looking one reads as a price the user forgot they paid.
                placeholder="Price you paid"
                className="h-11 tabular-nums"
                aria-invalid={buyForm.formState.errors.pricePerShare ? true : undefined}
                aria-describedby={
                  buyForm.formState.errors.pricePerShare ? 'buyPrice-error' : 'buyPrice-hint'
                }
                {...buyForm.register('pricePerShare', asNumber)}
              />
              {buyForm.formState.errors.pricePerShare ? (
                <p id="buyPrice-error" className="text-xs text-destructive">{buyForm.formState.errors.pricePerShare.message}</p>
              ) : (
                <p id="buyPrice-hint" className="text-xs text-muted-foreground">
                  {livePrice != null
                    ? `Filled from the live quote (${formatCurrency(livePrice)}) — edit it if you paid something else.`
                    : `No live price for ${position?.symbol ?? 'this symbol'} — enter the price you paid.`}
                </p>
              )}
            </div>
          </div>

          {buyTotal != null && (
            <p className="rounded-lg border bg-surface p-3 text-sm tabular-nums">
              <span className="text-muted-foreground">Total investment: </span>
              <span className="font-semibold">
                {buyShares.toLocaleString()} × {formatCurrency(buyPrice)} = {formatCurrency(buyTotal)}
              </span>
            </p>
          )}

          <TradingDateField
            id="buyDate"
            label="Buy date *"
            value={buyForm.watch('date') ?? ''}
            error={buyForm.formState.errors.date?.message}
            hint="PSX trades Monday to Friday — weekends can't be selected."
            onChange={(iso) => buyForm.setValue('date', iso, { shouldValidate: true })}
          />

          {preview && position && (
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              After this buy: <span className="font-semibold">{preview.shares.toLocaleString()} shares</span> at{' '}
              <span className="font-semibold">{formatCurrency(preview.averagePurchasePrice)}</span> average — was{' '}
              {position.shares.toLocaleString()} at {formatCurrency(position.averagePurchasePrice)}.
            </p>
          )}
        </>
      ) : sellOpen ? (
        <>
          {positionSummary}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sellShares">Quantity to sell *</Label>
              <Input
                id="sellShares"
                type="number"
                step="1"
                placeholder="How many shares"
                className="h-11 tabular-nums"
                aria-invalid={sellForm.formState.errors.shares ? true : undefined}
                aria-describedby={sellForm.formState.errors.shares ? 'sellShares-error' : undefined}
                {...sellForm.register('shares', asNumber)}
              />
              {sellForm.formState.errors.shares && (
                <p id="sellShares-error" className="text-xs text-destructive">{sellForm.formState.errors.shares.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellPrice">Sell price (PKR) *</Label>
              <Input
                id="sellPrice"
                type="number"
                step="0.01"
                placeholder="Price you sold at"
                className="h-11 tabular-nums"
                aria-invalid={sellForm.formState.errors.pricePerShare ? true : undefined}
                aria-describedby={sellForm.formState.errors.pricePerShare ? 'sellPrice-error' : 'sellPrice-hint'}
                {...sellForm.register('pricePerShare', asNumber)}
              />
              {sellForm.formState.errors.pricePerShare ? (
                <p id="sellPrice-error" className="text-xs text-destructive">{sellForm.formState.errors.pricePerShare.message}</p>
              ) : (
                <p id="sellPrice-hint" className="text-xs text-muted-foreground">
                  {livePrice != null
                    ? `Filled from the live quote (${formatCurrency(livePrice)}) — edit it if you sold elsewhere.`
                    : `No live price for ${position?.symbol ?? 'this symbol'} — enter the price you sold at.`}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sellFees">Fees (PKR)</Label>
            <Input
              id="sellFees"
              type="number"
              step="0.01"
              placeholder="0"
              className="h-11 tabular-nums"
              aria-invalid={sellForm.formState.errors.fees ? true : undefined}
              aria-describedby={sellForm.formState.errors.fees ? 'sellFees-error' : undefined}
              {...sellForm.register('fees', asNumber)}
            />
            {sellForm.formState.errors.fees && (
              <p id="sellFees-error" className="text-xs text-destructive">{sellForm.formState.errors.fees.message}</p>
            )}
          </div>

          <TradingDateField
            id="sellDate"
            label="Sell date *"
            value={sellForm.watch('date') ?? ''}
            error={sellForm.formState.errors.date?.message}
            hint="PSX trades Monday to Friday — weekends can't be selected."
            onChange={(iso) => sellForm.setValue('date', iso, { shouldValidate: true })}
          />

          {sellPreview && position && (
            <div className="space-y-2">
              <p className="rounded-lg border bg-surface p-3 text-sm tabular-nums">
                <span className="text-muted-foreground">Proceeds: </span>
                <span className="font-semibold">
                  {sellShares.toLocaleString()} × {formatCurrency(sellPrice)} = {formatCurrency(sellPreview.proceeds)}
                </span>
              </p>
              {sellPreview.remaining < 0 ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  You are selling <span className="font-semibold">{(-sellPreview.remaining).toLocaleString()}</span>{' '}
                  more {sellPreview.remaining === -1 ? 'share' : 'shares'} than owned — the server will refuse this sale.
                </p>
              ) : (
                <p className={`rounded-lg border p-3 text-xs ${sellPreview.realized >= 0 ? 'border-profit/30 bg-profit/5' : 'border-loss/30 bg-loss/5'}`}>
                  Realized P/L: <span className="font-semibold">{formatCurrency(sellPreview.realized)}</span> —{' '}
                  {sellPreview.remaining.toLocaleString()} {sellPreview.remaining === 1 ? 'share' : 'shares'} remain.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Company Search (only show when adding) */}
          {!isEditing && (
            <div className="space-y-2" role="group" aria-labelledby="company-search-label">
              <Label id="company-search-label">Search company</Label>
              <CompanySearch onSelect={handleCompanySelect} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="symbol">Ticker symbol *</Label>
              <Input
                id="symbol"
                placeholder="ENGRO"
                className="h-11 uppercase"
                aria-invalid={errors.symbol ? true : undefined}
                aria-describedby={errors.symbol ? 'symbol-error' : tickerMatch ? 'symbol-hint' : undefined}
                {...register('symbol')}
              />
              {errors.symbol && <p id="symbol-error" className="text-xs text-destructive">{errors.symbol.message}</p>}
              {!errors.symbol && tickerMatch && (
                <p id="symbol-hint" className="text-xs text-muted-foreground">
                  {tickerMatch.name} · {displaySector(tickerMatch.sector)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name *</Label>
              <Input
                id="companyName"
                placeholder="Engro Corporation"
                className="h-11"
                aria-invalid={errors.companyName ? true : undefined}
                aria-describedby={errors.companyName ? 'companyName-error' : undefined}
                {...register('companyName')}
              />
              {errors.companyName && (
                <p id="companyName-error" className="text-xs text-destructive">{errors.companyName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sector">Sector *</Label>
            <Controller
              name="sector"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="sector"
                    className="h-11"
                    aria-invalid={errors.sector ? true : undefined}
                    aria-describedby={errors.sector ? 'sector-error' : undefined}
                  >
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* A sector the curated list doesn't know yet (newly listed, or a
                        spelling we can't map) still has to be selectable; without
                        this the field shows its placeholder even though a value is
                        set, which is exactly the bug this fixes. */}
                    {field.value && !isCanonicalSector(field.value) && (
                      <SelectItem value={field.value}>{displaySector(field.value)}</SelectItem>
                    )}
                    {PSX_SECTORS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.sector && <p id="sector-error" className="text-xs text-destructive">{errors.sector.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shares">Number of shares *</Label>
              <Input
                id="shares"
                type="number"
                placeholder="500"
                step="1"
                className="h-11 tabular-nums"
                aria-invalid={errors.shares ? true : undefined}
                aria-describedby={errors.shares ? 'shares-error' : undefined}
                {...register('shares', asNumber)}
              />
              {errors.shares && <p id="shares-error" className="text-xs text-destructive">{errors.shares.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="averagePurchasePrice">Avg. buy price (PKR) *</Label>
              <Input
                id="averagePurchasePrice"
                type="number"
                placeholder="145.50"
                step="0.01"
                className="h-11 tabular-nums"
                aria-invalid={errors.averagePurchasePrice ? true : undefined}
                aria-describedby={errors.averagePurchasePrice ? 'averagePurchasePrice-error' : undefined}
                {...register('averagePurchasePrice', asNumber)}
              />
              {errors.averagePurchasePrice && (
                <p id="averagePurchasePrice-error" className="text-xs text-destructive">
                  {errors.averagePurchasePrice.message}
                </p>
              )}
            </div>
          </div>

          <TradingDateField
            id="purchaseDate"
            label="Purchase date *"
            value={watch('purchaseDate') ?? ''}
            error={errors.purchaseDate?.message}
            hint="PSX trades Monday to Friday — weekends can't be selected."
            onChange={(iso) => setValue('purchaseDate', iso, { shouldValidate: true })}
          />

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="Optional notes" {...register('notes')} className="h-11" />
          </div>

          {buys && buys.length > 0 && onUpdateBuy && (
            <BuyHistory
              symbol={defaultValues?.symbol ?? ''}
              buys={buys}
              onSave={onUpdateBuy}
              onDelete={onDeleteBuy ?? (() => {})}
            />
          )}

          {sells && sells.length > 0 && onUpdateSell && (
            <SellHistory
              symbol={defaultValues?.symbol ?? ''}
              sells={sells}
              onSave={onUpdateSell}
              onDelete={onDeleteSell ?? (() => {})}
            />
          )}

          {actions && onAddAction && (
            <CorporateActionsHistory
              actions={actions}
              onAdd={onAddAction}
              onDelete={onDeleteAction ?? (() => {})}
            />
          )}
        </>
      )}

      {/* One primary per surface: the submit is the only filled button here, and
          it shows the Button's own loading state while it validates and saves. */}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        {buyOpen || sellOpen ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setMode('edit')}>
              Back
            </Button>
            <Button type="submit" loading={buyOpen ? buyForm.formState.isSubmitting : sellForm.formState.isSubmitting}>
              {buyOpen ? 'Confirm buy' : 'Confirm sell'}
            </Button>
          </>
        ) : (
          <>
            {/* One tap from the row to a second purchase: the pencil already
                opens this dialog, so the buy lives here rather than behind a
                second control on the row. */}
            {onBuy && position && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMode('buy')}
              >
                Buy more
              </Button>
            )}
            {onSell && position && position.shares > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMode('sell')}
              >
                Sell shares
              </Button>
            )}
            <Button type="submit" loading={isSubmitting}>
              {isEditing ? 'Save changes' : 'Add holding'}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
