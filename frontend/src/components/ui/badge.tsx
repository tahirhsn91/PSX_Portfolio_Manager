import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * A badge is not a control: it renders a <span> (the old <div> was invalid
 * inside a paragraph or a table cell) and it has no hover background, because
 * hovering a label should not imply it can be clicked.
 *
 * Each money tone is a token pair — the tinted surface plus the ink that is
 * legible on it — so the same class is correct in both themes.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        neutral: 'border-transparent bg-muted text-muted-foreground',
        profit: 'border-transparent bg-profit-light text-profit-dark',
        loss: 'border-transparent bg-loss-light text-loss-dark',
        warning: 'border-transparent bg-warning-light text-warning-dark',
        info: 'border-transparent bg-info-light text-info-dark',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
