import { useEffect, useState } from 'react';

/** The media query the OS uses to ask for less movement. */
const QUERY = '(prefers-reduced-motion: reduce)';

function readPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * True while the OS asks for reduced motion.
 *
 * A chart's series animation is drawn by Recharts in JS — it is not a CSS
 * transition, so the `prefers-reduced-motion` block in `index.css` cannot switch
 * it off. Charts therefore read the preference here and pass
 * `isAnimationActive={!reduced}`, leaving the animation on for everyone else.
 *
 * The listener matters for a user who turns the setting on with the app already
 * open: its next render picks the change up instead of waiting for a reload.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readPreference);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(QUERY);
    // Re-read on mount: the setting can change between the first render and this
    // effect, and a chart that mounts mid-session should start off correctly.
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
