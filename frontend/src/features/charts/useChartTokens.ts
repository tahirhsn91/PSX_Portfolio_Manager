import { useEffect, useState } from 'react';
import { PROFIT_TONES, LOSS_TONES, CATEGORY_TONES, FLAT_TONE } from './chartTones';

/**
 * The chart tokens, resolved to concrete colours.
 *
 * Recharts writes a series' colour into an SVG **attribute** — `stroke`, `fill`,
 * `stop-color` — and a CSS custom property does not resolve in attribute
 * position; only a class-based utility or an inline style does. Gradients are the
 * awkward case: `stop-color` has no Tailwind utility, so the stop needs a value.
 *
 * Reading the variables off the document keeps `index.css` the single source of
 * these colours: no chart file carries a hex, and both themes come out right
 * because the values are re-read when the theme flips.
 */
export interface ChartTokens {
  /** The comparison series. */
  benchmark: string;
  /** Traded volume behind a price line. */
  volume: string;
  /** A holding's purchase price. */
  buy: string;
  /** A support level. */
  support: string;
  /** A resistance level. */
  resistance: string;
  /** A series that is neither a signal nor a level — the price line itself. */
  neutral: string;
  /** Mid-ladder tone for a value that is **up** over the chart's window. */
  up: string;
  /** Mid-ladder tone for a value that is **down** over the chart's window. */
  down: string;
  /**
   * Axis tick ink. Recharts writes `fill="#666"` onto every tick itself, and an
   * attribute beats an inherited class, so the axis' `fill-muted-foreground` class
   * never reached the tick text — the ticks stayed #666 (3.4:1 on the dark card).
   * This is the one non-series entry, and it exists for exactly that.
   */
  axis: string;
}

const CSS_VARIABLE: Record<keyof ChartTokens, string> = {
  benchmark: '--chart-benchmark',
  volume: '--chart-volume',
  buy: '--chart-buy',
  support: '--chart-support',
  resistance: '--chart-resistance',
  neutral: '--chart-neutral',
  up: '--chart-profit-3',
  down: '--chart-loss-3',
  axis: '--muted-foreground',
};

/** Tokens stored as raw HSL components (`216 17.1% 40.2%`) rather than a full colour. */
const HSL_COMPONENTS: ReadonlySet<keyof ChartTokens> = new Set<keyof ChartTokens>(['axis']);

const KEYS = Object.keys(CSS_VARIABLE) as (keyof ChartTokens)[];

/**
 * `currentColor` is the stand-in when a variable cannot be read (no document, or
 * a token that was renamed): an inherited colour still draws a visible series,
 * and unlike a fallback hex it cannot go stale in one theme. It also keeps this
 * file free of the very literals it exists to remove.
 */
const UNRESOLVED = 'currentColor';

function readValue(styles: CSSStyleDeclaration, key: keyof ChartTokens): string {
  const raw = styles.getPropertyValue(CSS_VARIABLE[key]).trim();
  if (!raw) return UNRESOLVED;
  return HSL_COMPONENTS.has(key) ? `hsl(${raw})` : raw;
}

function readChartTokens(): ChartTokens {
  const tokens = {} as ChartTokens;
  if (typeof document === 'undefined') {
    for (const key of KEYS) tokens[key] = UNRESOLVED;
    return tokens;
  }
  const styles = getComputedStyle(document.documentElement);
  for (const key of KEYS) {
    tokens[key] = readValue(styles, key);
  }
  return tokens;
}

export function useChartTokens(): ChartTokens {
  const [tokens, setTokens] = useState<ChartTokens>(readChartTokens);

  useEffect(() => {
    setTokens(readChartTokens());
    // A theme flip swaps the class on <html>, and that is where the light and
    // dark values of every variable live — so re-read them rather than keeping
    // the first paint's colours. Observing the class (not the media query) also
    // covers the in-app theme switch, which sets the class rather than the OS.
    const observer = new MutationObserver(() => setTokens(readChartTokens()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return tokens;
}

/** `fill-chart-cat-1` -> `--chart-cat-1`; a tone's class and its CSS variable differ by exactly this. */
const fillClassToVar = (fillClass: string): string => `--${fillClass.slice('fill-'.length)}`;

/**
 * The tone-ladder fills, resolved to concrete colours.
 *
 * Recharts' pie `Sector` and bar `Rectangle` write the series colour into the
 * SVG `fill` **attribute** (their own default `#808080` when a `<Cell>` carries
 * only a class), and a CSS custom property does not resolve in attribute
 * position — so the class-based `fill-chart-*` utility a slice wears cannot be
 * relied on to win against that attribute. Reading the variable off the
 * document keeps `index.css` the single source of these colours, and the values
 * are re-read on theme flip exactly like `useChartTokens`.
 */
function readToneFills(): Record<string, string> {
  const fills: Record<string, string> = {};
  if (typeof document === 'undefined') return fills;
  const styles = getComputedStyle(document.documentElement);
  for (const tone of [...PROFIT_TONES, ...LOSS_TONES, ...CATEGORY_TONES, FLAT_TONE]) {
    fills[tone.fill] = styles.getPropertyValue(fillClassToVar(tone.fill)).trim() || UNRESOLVED;
  }
  return fills;
}

/** Keyed by the tone's `fill` class, returns the concrete colour to hand recharts as a `fill` attribute. */
export function useToneFills(): Record<string, string> {
  const [fills, setFills] = useState<Record<string, string>>(readToneFills);

  useEffect(() => {
    setFills(readToneFills());
    const observer = new MutationObserver(() => setFills(readToneFills()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return fills;
}
