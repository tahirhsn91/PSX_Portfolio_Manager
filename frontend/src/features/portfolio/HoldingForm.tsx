import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompanySearch } from '@/components/shared';
import { holdingSchema, normalizeSector, sectorForSymbol, isCanonicalSector, displaySector, type HoldingFormValues } from '@/utils';
import { PSX_SECTORS } from '@/constants';
import { useCompanySearch } from '@/hooks';
import type { PSXCompany } from '@/types';

interface HoldingFormProps {
  defaultValues?: Partial<HoldingFormValues>;
  onSubmit: (values: HoldingFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function HoldingForm({ defaultValues, onSubmit, onCancel, isEditing }: HoldingFormProps) {
  const { register, handleSubmit, control, setValue, watch, formState: { errors, isSubmitting } } = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: {
      purchaseDate: format(new Date(), 'yyyy-MM-dd'),
      ...defaultValues,
    },
  });

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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <Input id="symbol" placeholder="ENGRO" {...register('symbol')} className="uppercase" />
          {errors.symbol && <p className="text-xs text-destructive">{errors.symbol.message}</p>}
          {!errors.symbol && tickerMatch && (
            <p className="text-xs text-muted-foreground">
              {tickerMatch.name} · {displaySector(tickerMatch.sector)}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyName">Company Name *</Label>
          <Input id="companyName" placeholder="Engro Corporation" {...register('companyName')} />
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
              <SelectTrigger>
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
            {...register('averagePurchasePrice', { valueAsNumber: true })}
          />
          {errors.averagePurchasePrice && <p className="text-xs text-destructive">{errors.averagePurchasePrice.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="purchaseDate">Purchase Date *</Label>
        <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
        {errors.purchaseDate && <p className="text-xs text-destructive">{errors.purchaseDate.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" placeholder="Optional notes" {...register('notes')} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isEditing ? 'Save Changes' : 'Add Holding'}
        </Button>
      </div>
    </form>
  );
}
