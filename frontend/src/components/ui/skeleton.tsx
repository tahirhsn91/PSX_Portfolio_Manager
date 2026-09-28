import { cn } from '@/lib/utils';

/*
 * Skeletons shimmer instead of pulsing: a pulse fades the whole block in and
 * out (which reads as "something is broken") while a shimmer reads as "content
 * is arriving". Hidden from assistive tech — the loading state belongs to the
 * region that owns it, not to each grey box.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-gradient-to-r from-muted via-surface-2 to-muted bg-[length:200%_100%]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
