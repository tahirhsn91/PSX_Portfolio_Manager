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
import {
  holdingSchema, buySchema, normalizeSector, sectorForSymbol, isCanonicalSector, displaySector,
  mostRecentTradingDay, blendPurchase, formatCurrency,
  type HoldingFormValues, type BuyFormValues,
} from '@/utils';
import { PSX_SECTORS, EARLIEST_PURCHASE_DATE } from '@/constants';
import { useCompanySearch, useStockQuote } from '@/hooks';
import type { PSXCompany } from '@/types';

/** The position a buy would be blended into. */
export interface PositionSnapshot {
  symbol: string;
  shares: number;
  averagePurchasePrice: number;
}

interface HoldingFormProps {
  defaultValues?: Partial<HoldingFormValues>;
  onSubmit: (values: HoldingFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
  /** Edit dialog only. When given, the dialog offers "Buy more". */
  position?: PositionSnapshot;
  onBuy?: (values: BuyFormValues) => void;
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
            className="h-11 cursor-pointer pr-11 sm:h-10 sm:pr-10"
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Choose ${label.replace(' *', '').toLowerCase()}`}
              className="absolute right-0 top-1/2 h-11 w-11 -translate-y-1/2 text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:right-0.5 sm:h-8 sm:w-8"
            >
              <CalendarIcon className="h-4 w-4" />
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
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function HoldingForm({ defaultValues, onSubmit, onCancel, isEditing, position, onBuy }: HoldingFormProps) {
  // 'edit' is the form as it was; 'buy' records a second purchase of the same
  // stock and blends it into the position.
  const [mode, setMode] = useState<'edit' | 'buy'>('edit');
  const buyOpen = mode === 'buy';

  const { register, handleSubmit, control, setValue, watch, formState: { errors, isSubmitting } } = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: {
      // The most recent session by default, so the field is never empty on a new
      // holding — and never proposes a weekend, which the calendar below refuses.
      purchaseDate: format(mostRecentTradingDay(), 'yyyy-MM-dd'),
      ...defaultValues,
    },
  });

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
  const { data: quote } = useStockQuote(buyOpen ? position?.symbol : undefined);
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

  const submitBuy = buyForm.handleSubmit((values) => onBuy?.(values));

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
    <form onSubmit={buyOpen ? submitBuy : handleSubmit(onSubmit)} className="space-y-4">
      {/* Every control is a full 44px on phones and the desktop 40px from sm up:
          a thumb needs the height, a mouse does not. */}
      {buyOpen ? (
        <>
          {positionSummary}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="buyShares">Quantity to buy *</Label>
              <Input
                id="buyShares"
                type="number"
                step="1"
                placeholder="How many shares"
                className="h-11 sm:h-10"
                {...buyForm.register('shares', { valueAsNumber: true })}
              />
              {buyForm.formState.errors.shares && (
                <p className="text-xs text-destructive">{buyForm.formState.errors.shares.message}</p>
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
                className="h-11 sm:h-10"
                {...buyForm.register('pricePerShare', { valueAsNumber: true })}
              />
              {buyForm.formState.errors.pricePerShare ? (
                <p className="text-xs text-destructive">{buyForm.formState.errors.pricePerShare.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {livePrice != null
                    ? `Filled from the live quote (${formatCurrency(livePrice)}) — edit it if you paid something else.`
                    : `No live price for ${position?.symbol ?? 'this symbol'} — enter the price you paid.`}
                </p>
              )}
            </div>
          </div>

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
      ) : (
        <>
          {/* Company Search (only show when adding) */}
          {!isEditing && (
            <div className="space-y-2">
              <Label>Search Company</Label>
              <CompanySearch onSelect={handleCompanySelect} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Ticker Symbol *</Label>
              <Input id="symbol" placeholder="ENGRO" {...register('symbol')} className="h-11 uppercase sm:h-10" />
              {errors.symbol && <p className="text-xs text-destructive">{errors.symbol.message}</p>}
              {!errors.symbol && tickerMatch && (
                <p className="text-xs text-muted-foreground">
                  {tickerMatch.name} · {displaySector(tickerMatch.sector)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input id="companyName" placeholder="Engro Corporation" {...register('companyName')} className="h-11 sm:h-10" />
              {errors.companyName && <p className="text-xs text-destructive">{errors.companyName.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sector *</Label>
            <Controller
              name="sector"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 sm:h-10">
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
            {errors.sector && <p className="text-xs text-destructive">{errors.sector.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shares">Number of Shares *</Label>
              <Input
                id="shares"
                type="number"
                placeholder="500"
                step="1"
                className="h-11 sm:h-10"
                {...register('shares', { valueAsNumber: true })}
              />
              {errors.shares && <p className="text-xs text-destructive">{errors.shares.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="averagePurchasePrice">Avg. Buy Price (PKR) *</Label>
              <Input
                id="averagePurchasePrice"
                type="number"
                placeholder="145.50"
                step="0.01"
                className="h-11 sm:h-10"
                {...register('averagePurchasePrice', { valueAsNumber: true })}
              />
              {errors.averagePurchasePrice && <p className="text-xs text-destructive">{errors.averagePurchasePrice.message}</p>}
            </div>
          </div>

          <TradingDateField
            id="purchaseDate"
            label="Purchase Date *"
            value={watch('purchaseDate') ?? ''}
            error={errors.purchaseDate?.message}
            hint="PSX trades Monday to Friday — weekends can't be selected."
            onChange={(iso) => setValue('purchaseDate', iso, { shouldValidate: true })}
          />

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="Optional notes" {...register('notes')} className="h-11 sm:h-10" />
          </div>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={onCancel}>Cancel</Button>
        {buyOpen ? (
          <>
            <Button type="button" variant="ghost" className="h-11 sm:h-10" onClick={() => setMode('edit')}>
              Back
            </Button>
            <Button type="submit" className="h-11 sm:h-10" disabled={buyForm.formState.isSubmitting}>
              Confirm Buy
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
                className="h-11 sm:h-10"
                onClick={() => setMode('buy')}
              >
                Buy more
              </Button>
            )}
            <Button type="submit" className="h-11 sm:h-10" disabled={isSubmitting}>
              {isEditing ? 'Save Changes' : 'Add Holding'}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
