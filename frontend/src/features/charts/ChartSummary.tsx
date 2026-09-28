import { cn } from '@/lib/utils';
import { FAMILY_TEXT, type ToneFamily } from './chartTones';

export interface ChartSummaryItem {
  /** What the figure is: a date range, a series name, a level. */
  label: string;
  /** The figure itself, already formatted. */
  value: string;
  /** Colours the figure by meaning — the label always says what it is, so the colour is a bonus. */
  tone?: ToneFamily;
}

interface ChartSummaryProps {
  /** What the list covers, e.g. `Last 5 sessions`. */
  caption: string;
  items: ChartSummaryItem[];
  className?: string;
}

/**
 * A chart's figures as real DOM text.
 *
 * Everything a chart draws is otherwise mouse-only: the tooltip arrives on hover,
 * takes no focus and is never announced, so a keyboard or screen-reader user
 * could not reach a single value. This list carries the same figures in text —
 * selectable, focusable-free, and read in order.
 *
 * 12px is the floor for body text in this app, which is also why the axis ticks
 * were raised from 9-11px to match it.
 */
export function ChartSummary({ caption, items, className }: ChartSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn('mt-3 rounded-md border border-border bg-surface-2 px-3 py-2', className)}>
      <p className="text-xs font-medium text-foreground">{caption}</p>
      <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-baseline justify-between gap-3">
            <span className="truncate text-muted-foreground" title={item.label}>
              {item.label}
            </span>
            <span className={cn('shrink-0 font-mono tabular-nums', FAMILY_TEXT[item.tone ?? 'flat'])}>
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
