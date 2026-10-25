import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** The group's accessible name — there is no visible label beside these. */
  label: string;
  /** Tighter type for a control that sits in a card header. */
  compact?: boolean;
  className?: string;
}

/**
 * A row of toggle buttons — the pattern for "which of these views am I in".
 *
 * It is deliberately not a tablist. Radix `Tabs` was used here before, but with
 * no `TabsContent` behind it the triggers pointed `aria-controls` at panels that
 * do not exist, which axe flags as a critical ARIA error and which announces
 * "tab, 1 of 2" for something that is really a two-state switch. `aria-pressed`
 * on a `group` is what the ARIA authoring practices prescribe for this.
 *
 * The type, height and active fill match `Tabs`' segmented variant, so a screen
 * that switches to it does not change shape.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  compact = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex min-h-11 max-w-full flex-wrap items-center justify-start gap-0.5 rounded-md border bg-surface p-0.5 text-muted-foreground',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-[color,background-color,box-shadow] duration-base ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              compact && 'rounded px-2.5 text-xs',
              active
                ? 'bg-primary text-primary-foreground shadow-card'
                : 'hover:bg-muted hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
