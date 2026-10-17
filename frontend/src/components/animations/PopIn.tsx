import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PopInProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before the pop. */
  delay?: number;
  /** Starting scale. */
  from?: number;
}

/**
 * Spring scale+fade entrance — for badges, chips and marks that should
 * "pop" into place rather than rise. Respects `prefers-reduced-motion`.
 */
export function PopIn({ children, className, delay = 0, from = 0.6 }: PopInProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { scale: from, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26, delay: reduced ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}
