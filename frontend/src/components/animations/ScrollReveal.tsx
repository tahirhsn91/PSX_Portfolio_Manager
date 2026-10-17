import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useScrollRoot } from './scrollRoot';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds to hold after the element enters view before it animates. */
  delay?: number;
  /** Re-hide and replay each time it scrolls back out (default: reveal once). */
  repeat?: boolean;
}

/**
 * Reveals children when they scroll into view. Implemented with a raw
 * IntersectionObserver against the app's real scroll container (`<main>`) —
 * the animation-on-scroll pattern — because the window never scrolls here.
 *
 * The element carries the `animate-on-scroll` class (paused) and flips to
 * `in-view` (running) when intersecting, so the CSS keyframes own the motion.
 */
export function ScrollReveal({ children, className, delay = 0, repeat = false }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rootRef = useScrollRoot();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in-view');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('in-view');
            if (!repeat) observer.unobserve(entry.target);
          } else if (repeat) {
            el.classList.remove('in-view');
          }
        });
      },
      { root: rootRef?.current ?? null, threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [repeat, rootRef]);

  return (
    <div
      ref={ref}
      className={cn('animate-on-scroll', className)}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
