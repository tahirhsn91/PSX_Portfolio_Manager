import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedNumberProps {
  value: number;
  /** Formats the animated number each frame. Defaults to a locale string. */
  format?: (n: number) => string;
  /** Seconds to count from the previous value to this one. */
  duration?: number;
  /** Flash the figure briefly when it changes, so a live update is noticed. */
  highlight?: boolean;
}

const defaultFormat = (n: number) => n.toLocaleString();

/**
 * Counts a figure from its previous value to `value`. Used for money and
 * percentage reads so a number lands with motion instead of just being
 * replaced. Respects `prefers-reduced-motion` by snapping straight to the
 * value.
 *
 * With `highlight`, a change also flashes the figure briefly. The flash is
 * driven by the same value change as the count, so it fires once per update —
 * polling every 60s cannot flicker it.
 */
export function AnimatedNumber({ value, format, duration = 1.1, highlight = false }: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const formatRef = useRef(format ?? defaultFormat);
  formatRef.current = format ?? defaultFormat;
  const [display, setDisplay] = useState(() => formatRef.current(value));
  const [flash, setFlash] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    const changed = previous.current !== value;
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
    if (changed && highlight) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => {
        controls.stop();
        clearTimeout(t);
      };
    }
    return () => controls.stop();
  }, [value, duration, reduced, highlight]);

  return (
    <span
      className={cn(
        'tabular-nums rounded transition-colors duration-500',
        flash && 'bg-primary/10',
      )}
    >
      {display}
    </span>
  );
}
