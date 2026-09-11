import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { portfolioSchema, type PortfolioFormValues } from '@/utils';
import { PORTFOLIO_COLORS } from '@/constants';
import { cn } from '@/lib/utils';
import type { Portfolio } from '@/types';

interface PortfolioFormProps {
  defaultValues?: Partial<PortfolioFormValues>;
  onSubmit: (values: PortfolioFormValues) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

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
      <div className="space-y-2">
        <Label htmlFor="name">Portfolio Name *</Label>
        <Input id="name" placeholder="e.g. Long Term Growth" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" placeholder="Optional description" {...register('description')} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PORTFOLIO_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setValue('color', color)}
              className={cn(
                'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                selectedColor === color ? 'border-foreground scale-110' : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isEditing ? 'Save Changes' : 'Create Portfolio'}
        </Button>
      </div>
    </form>
  );
}
