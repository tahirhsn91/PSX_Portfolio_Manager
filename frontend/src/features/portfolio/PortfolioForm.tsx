import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { portfolioSchema, type PortfolioFormValues } from '@/utils';
import { PORTFOLIO_COLORS } from '@/constants';
import { cn } from '@/lib/utils';

interface PortfolioFormProps {
  defaultValues?: Partial<PortfolioFormValues>;
  onSubmit: (values: PortfolioFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

/**
 * The portfolio form.
 *
 * Every field carries a visible `<label>` bound by `htmlFor`, and its error is
 * rendered *next to the field* (and wired to the input through `aria-invalid` +
 * `aria-describedby`) — a message that only appears in a toast is gone by the
 * time the user looks back at the field that caused it. The colour swatches are
 * 44px targets with `aria-pressed`, and the submit button shows the Button's own
 * `loading` state instead of a form that looks inert while it validates.
 */
export function PortfolioForm({ defaultValues, onSubmit, onCancel, isEditing }: PortfolioFormProps) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<PortfolioFormValues>({
    resolver: zodResolver(portfolioSchema),
    defaultValues: {
      color: PORTFOLIO_COLORS[0],
      ...defaultValues,
    },
  });

  const selectedColor = watch('color');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-xs text-muted-foreground">Fields marked * are required.</p>

      <div className="space-y-2">
        <Label htmlFor="name">Portfolio name *</Label>
        <Input
          id="name"
          placeholder="e.g. Long Term Growth"
          className="h-11"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="name-error" className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          placeholder="Optional description"
          className="h-11"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'description-error' : undefined}
          {...register('description')}
        />
        {errors.description && (
          <p id="description-error" className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        {/* The swatch row is a group of toggle buttons, so it is labelled as a
            group: a bare <span> next to unlabelled circles told a screen reader
            nothing about what the colours choose. */}
        <Label id="portfolio-color-label">Colour</Label>
        <div role="group" aria-labelledby="portfolio-color-label" className="flex flex-wrap gap-2">
          {PORTFOLIO_COLORS.map((color, index) => {
            const selected = selectedColor === color;
            return (
              <button
                key={color}
                type="button"
                aria-label={`Colour ${index + 1}`}
                aria-pressed={selected}
                onClick={() => setValue('color', color, { shouldDirty: true })}
                className={cn(
                  'h-11 w-11 shrink-0 rounded-full border-2 transition-[border-color,transform] duration-base ease-standard',
                  'hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected ? 'border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          The colour marks this portfolio in lists and charts.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>
          {isEditing ? 'Save changes' : 'Create portfolio'}
        </Button>
      </div>
    </form>
  );
}
