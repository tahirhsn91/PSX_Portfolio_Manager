import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

/*
 * Three strips, one API. Each variant declares its own selected state (scoped
 * with `group-data-[variant=…]`, read off the list) so the variants cannot fight
 * over specificity the way a shared `data-[state=active]` rule would.
 *
 *  - `default`   the page strip: an inset pill track, selected tab filled with
 *                the action colour.
 *  - `segmented` a compact in-card switch (period buttons, chart ranges).
 *  - `underline` the detail-page strip: no track, a 2px action-coloured rule
 *                under the selected tab. Reads as navigation between views of
 *                one record rather than a mode switch.
 *
 * Every trigger is at least 44px tall, and the strips scroll inside themselves
 * instead of pushing the page wide.
 */
export type TabsListVariant = 'default' | 'segmented' | 'underline';

const LIST_VARIANT_CLASS: Record<TabsListVariant, string> = {
  default:
    'inline-flex h-12 max-w-full items-stretch justify-start overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground sm:h-11',
  segmented:
    'group inline-flex h-11 max-w-full items-center justify-start gap-0.5 overflow-x-auto rounded-md border bg-surface p-0.5 text-muted-foreground',
  underline:
    'inline-flex h-11 max-w-full items-stretch justify-start gap-1 overflow-x-auto border-b border-border p-0 text-muted-foreground',
};

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsListVariant }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn('group', LIST_VARIANT_CLASS[variant], className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium ring-offset-background transition-[color,background-color,border-color,box-shadow] duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      // default: filled pill track
      'group-data-[variant=default]:hover:text-foreground group-data-[variant=default]:data-[state=active]:bg-primary group-data-[variant=default]:data-[state=active]:text-primary-foreground group-data-[variant=default]:data-[state=active]:shadow-card',
      // segmented: compact switch inside a card header
      'group-data-[variant=segmented]:h-10 group-data-[variant=segmented]:rounded group-data-[variant=segmented]:px-2.5 group-data-[variant=segmented]:text-xs group-data-[variant=segmented]:hover:bg-muted group-data-[variant=segmented]:data-[state=active]:bg-primary group-data-[variant=segmented]:data-[state=active]:text-primary-foreground',
      // underline: navigation between views of one record
      'group-data-[variant=underline]:rounded-none group-data-[variant=underline]:border-b-2 group-data-[variant=underline]:border-transparent group-data-[variant=underline]:px-3 group-data-[variant=underline]:hover:text-foreground group-data-[variant=underline]:data-[state=active]:border-primary group-data-[variant=underline]:data-[state=active]:text-foreground',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
