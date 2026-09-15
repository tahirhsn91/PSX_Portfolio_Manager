import { useState } from 'react';
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
import { holdingSchema, normalizeSector, sectorForSymbol, isCanonicalSector, displaySector, type HoldingFormValues } from '@/utils';
import { PSX_SECTORS } from '@/constants';
import type { PSXCompany } from '@/types';

interface HoldingFormProps {
  defaultValues?: Partial<HoldingFormValues>;
  onSubmit: (values: HoldingFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export function HoldingForm({ defaultValues, onSubmit, onCancel, isEditing }: HoldingFormProps) {
  // Calendar popover visibility for the purchase-date field.
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: {
      // Today by default, so the field is never empty on a new holding.
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
        {/* Text field + calendar button on the right. The typed value stays an
            ISO date string (what the schema and the store expect); the field
            just *shows* it in a readable format. */}
        <Controller
          name="purchaseDate"
          control={control}
          render={({ field }) => {
            const parsed = field.value ? parseISO(field.value) : new Date();
            const current = isValid(parsed) ? parsed : new Date();

            return (
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <div className="relative">
                  <Input
                    id="purchaseDate"
                    readOnly
                    value={format(current, 'dd MMM yyyy')}
                    onClick={() => setDatePickerOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={datePickerOpen}
                    className="cursor-pointer pr-10"
                  />
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Choose purchase date"
                      className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                </div>
                <PopoverContent align="end" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    autoFocus
                    selected={current}
                    defaultMonth={current}
                    // A holding can't have been bought in the future.
                    disabled={{ after: new Date() }}
                    onSelect={(date) => {
                      if (!date) return;
                      field.onChange(format(date, 'yyyy-MM-dd'));
                      setDatePickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            );
          }}
        />
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
