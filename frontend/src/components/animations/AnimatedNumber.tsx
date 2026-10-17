import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Formats the animated number each frame. Defaults to a locale string. */
  format?: (n: number) => string;
  /** Seconds to count from the previous value to this one. */
  duration?: number;
}

const defaultFormat = (n: number) => n.toLocaleString();

/**
 * Counts a figure from its previous value to `value`. Used for money and
 * percentage reads so a number lands with motion instead of just being
 * replaced. Respects `prefers-reduced-motion` by snapping straight to the
 * value.
 */
export function AnimatedNumber({ value, format, duration = 1.1 }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const formatRef = useRef(format ?? defaultFormat);
  formatRef.current = format ?? defaultFormat;
  const [display, setDisplay] = useState(() => formatRef.current(value));
  const previous = useRef(value);

  useEffect(() => {
    if (reduced) {
      previous.current = value;
      setDisplay(formatRef.current(value));
      return;
    }
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.2, 0, 0, 1],
      onUpdate: (v) => setDisplay(formatRef.current(v)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration, reduced]);

  return <span className="tabular-nums">{display}</span>;
}
