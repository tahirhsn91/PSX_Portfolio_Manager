import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * Every mutation in this app called `addNotification` and nothing ever rendered
 * it, so "Portfolio created", "Import failed" and "All data cleared" were all
 * invisible. These are the primitives that finally show them, built on the
 * Radix package that was already installed.
 */
const ToastProvider = ToastPrimitive.Provider;

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border p-4 pr-10 shadow-overlay transition-[transform,opacity] duration-base ease-standard data-[state=open]:animate-fade-in motion-reduce:animate-none data-[state=closed]:opacity-0 data-[state=swipeend]:translate-x-full data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0',
  {
    variants: {
      variant: {
        info: 'border-border bg-overlay text-foreground',
        success: 'border-profit/30 bg-profit-light text-profit-dark',
        warning: 'border-warning/30 bg-warning-light text-warning-dark',
        error: 'border-loss/30 bg-loss-light text-loss-dark',
      },
    },
    defaultVariants: { variant: 'info' },
  }
);

const ICON = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

export type ToastVariant = NonNullable<VariantProps<typeof toastVariants>['variant']>;

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & { variant?: ToastVariant }
>(({ className, variant = 'info', children, ...props }, ref) => {
  const Icon = ICON[variant];
  return (
    <ToastPrimitive.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props}>
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </ToastPrimitive.Root>
  );
});
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn('mt-0.5 text-sm opacity-90', className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    aria-label="Dismiss notification"
    className={cn(
      'absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-md opacity-70 transition-opacity duration-base ease-standard hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  >
    <X aria-hidden="true" className="h-4 w-4" />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      // Above the mobile bottom bar, and clear of the home indicator.
      'fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex max-h-screen w-auto flex-col-reverse gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[380px]',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

export { ToastProvider, Toast, ToastTitle, ToastDescription, ToastClose, ToastViewport };
