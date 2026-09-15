import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Calendar — themed wrapper around react-day-picker (v10).
 *
 * Styled entirely with Tailwind utilities (no `react-day-picker/style.css`
 * import), so it inherits the app's light/dark tokens like every other
 * shadcn-style component. The classNames keys below are v10's UI enum values
 * (see `react-day-picker` → dist/…/UI.js); anything you pass in `classNames`
 * overrides the matching entry.
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4 sm:flex-row',
        month: 'flex flex-col gap-4',
        month_caption: 'relative flex items-center justify-center pt-1',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        // Same ghost-button treatment for both arrows; each is absolutely
        // positioned by the caption row, so the label stays centred.
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'absolute left-1 h-7 w-7 p-0 opacity-60 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'absolute right-1 h-7 w-7 p-0 opacity-60 hover:opacity-100',
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[0.8rem] font-normal text-muted-foreground',
        week: 'mt-2 flex w-full',
        day: 'h-9 w-9 p-0 text-center text-sm',
        day_button:
          'h-9 w-9 rounded-md p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground',
        selected: cn(
          'rounded-md bg-primary text-primary-foreground',
          '[&>button]:text-primary-foreground [&>button:hover]:bg-primary',
        ),
        today: 'rounded-md bg-accent font-semibold text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      {...props}
    />
  );
}
