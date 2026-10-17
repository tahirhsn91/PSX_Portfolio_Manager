import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Seconds to wait before the reveal starts. */
  delay?: number;
  /** Seconds the reveal takes. */
  duration?: number;
  /** Pixels to rise while fading in. */
  y?: number;
  className?: string;
}

/**
 * Fade-and-rise on mount. The app's default entrance: transform + opacity only
 * (GPU-friendly), snapped to nothing under `prefers-reduced-motion`.
 */
export function Reveal({ children, delay = 0, duration = 0.5, y = 24, className }: RevealProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : duration, delay, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
