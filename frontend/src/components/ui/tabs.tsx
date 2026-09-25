import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

/**
 * `default` is the page-level strip (scrolls, 40/44px tall, inset pill).
 *
 * `segmented` is a compact two-or-three-way switch that lives inside a card header:
 * a bordered track with a solid `bg-primary` fill on the selected segment, matching
 * the comparison-period control and the nav's active item. It carries no height, no
 * padding and no background of its own so there is nothing for a call site to fight —
 * the trigger reads the variant off the list via `group-data-[variant=…]`.
 */
export type TabsListVariant = 'default' | 'segmented';

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsListVariant }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn(
      variant === 'segmented'
        ? // A compact switch: bordered track, and (in the trigger) a solid fill on the
          // selected half. No height/padding/background of its own to fight a call site.
          'group inline-flex items-center justify-start gap-0.5 rounded-md border p-0.5 text-muted-foreground'
        : // A strip whose labels are wider than the viewport (the portfolio page's
          // third tab carries the portfolio name and the benchmark) used to run off
          // the screen with no way to reach the last tab. `max-w-full overflow-x-auto`
          // keeps the strip inside the page and lets it scroll within itself, and the
          // triggers below are `shrink-0` so they scroll instead of squashing.
          // Height: 44px on phones (a full-height item), back to the desktop 40px/32px
          // pair from sm up, so desktop density is untouched.
          'inline-flex h-11 max-w-full items-stretch justify-start overflow-x-auto rounded-md bg-muted p-0 text-muted-foreground sm:h-10 sm:items-center sm:p-1',
      className
    )}
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
      'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
      // `bg-background` cannot be the selected state here: in the dark theme it equals the
      // card's own background, so the selected tab reads as a hole while the unselected
      // ones read as the box ("the dark colour does not cover the whole tab" / "a white
      // square", depending on which strip). `bg-primary` + `text-primary-foreground` is
      // the app's selected-state colour everywhere else — the sidebar, the mobile nav,
      // the calendar's selected day and the comparison-period buttons — so the strips
      // follow it too. Measured 6.4:1 on the dark theme's pair, 4.6:1 on the light one.
      //
      // `segmented` adds a compact hit area and a fill that covers its whole segment.
      'group-data-[variant=segmented]:rounded group-data-[variant=segmented]:px-2.5 group-data-[variant=segmented]:py-1 group-data-[variant=segmented]:text-xs group-data-[variant=segmented]:hover:bg-muted group-data-[variant=segmented]:data-[state=active]:bg-primary group-data-[variant=segmented]:data-[state=active]:text-primary-foreground group-data-[variant=segmented]:data-[state=active]:shadow-none',
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
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
