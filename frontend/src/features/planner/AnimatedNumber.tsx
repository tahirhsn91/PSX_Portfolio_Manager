import { useEffect } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Receives the animating value; round and format here. */
  format: (value: number) => string;
  className?: string;
}

/**
 * Springs a figure to its new value so a keystroke reads as a result, not a
 * jump. Reduced-motion users get the number directly.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const spring = useSpring(value, { stiffness: 140, damping: 24, mass: 0.5 });
  const display = useTransform(spring, (v) => format(v));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  if (reduced) return <span className={className}>{format(value)}</span>;
  return <motion.span className={className}>{display}</motion.span>;
}
