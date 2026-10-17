import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import type { RefObject } from 'react';

interface ScrollProgressProps {
  /** The scrollable element whose progress this bar tracks. */
  containerRef: RefObject<HTMLElement | null>;
}

/**
 * A hairline reading bar across the top of the content column, tied to the
 * actual scroll position of `<main>` (the window never scrolls). Springed so it
 * trails slightly instead of sticking to the thumb.
 */
export function ScrollProgress({ containerRef }: ScrollProgressProps) {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ container: containerRef });
  const scaleX = useSpring(scrollYProgress, { stiffness: 150, damping: 30, restDelta: 0.001 });

  if (reduced) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 origin-left bg-primary"
    />
  );
}
