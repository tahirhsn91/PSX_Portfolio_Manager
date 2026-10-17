import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

interface StaggerProps {
  children: ReactNode;
  className?: string;
  /** Seconds between each child's start. */
  stagger?: number;
  /** Seconds before the first child starts. */
  delay?: number;
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  /** Pixels each item rises while fading in. */
  y?: number;
}

/**
 * Orchestrates its `<StaggerItem>` children so they enter one after another,
 * like cards dealt onto a table. The container only drives timing; the items
 * carry the motion.
 */
export function Stagger({ children, className, stagger = 0.08, delay = 0 }: StaggerProps) {
  const reduced = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: stagger, delayChildren: delay },
    },
  };

  return (
    <motion.div
      className={className}
      variants={container}
      initial={reduced ? false : 'hidden'}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, y = 20 }: StaggerItemProps) {
  const item: Variants = {
    hidden: { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0, 0, 1] } },
  };

  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}
