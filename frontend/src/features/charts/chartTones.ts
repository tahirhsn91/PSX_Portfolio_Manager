/**
 * Turning a holding's or sector's profit/loss into a chart colour.
 *
 * Two rules, in order:
 *
 *  - The **family** says what happened. Green for a gain, red for a loss, slate for
 *    a priced position sitting exactly at break-even — and for one the feed can't
 *    price at all (`gain === null`), because an unknown is not a profit.
 *  - The **tone** says which one. Each family walks its own ladder in order, so two
 *    slices next to each other in the same family never land on the same colour. A
 *    single green for every profitable holding is what made the old chart
 *    unreadable: seven greens that were all the same green told you nothing about
 *    which holding was which.
 *
 * The class strings are written out in full rather than assembled from a number,
 * because Tailwind only generates a utility it can find as a literal in the source.
 * The values live in `src/index.css`, so light and dark themes each get a ladder
 * tuned for their background.
 *
 * Each tone carries the ink that stays legible *on it*: the in-slice percentage
 * label is 11px, so it needs 4.5:1 against its own slice, not against the card.
 */
export type ToneFamily = 'profit' | 'loss' | 'flat';

export interface ChartTone {
  /** Class that paints the slice. */
  fill: string;
  /** Class for text drawn on top of that slice. */
  ink: string;
  /**
   * Class for the legend swatch. A separate literal rather than `fill` with the
   * prefix swapped, because Tailwind only generates the utilities it can read in the
   * source — and the swatch has to be a background, not an SVG fill.
   */
  swatch: string;
}

export const PROFIT_TONES: readonly ChartTone[] = [
  { fill: 'fill-chart-profit-1', ink: 'fill-chart-profit-1-ink', swatch: 'bg-chart-profit-1' },
  { fill: 'fill-chart-profit-2', ink: 'fill-chart-profit-2-ink', swatch: 'bg-chart-profit-2' },
  { fill: 'fill-chart-profit-3', ink: 'fill-chart-profit-3-ink', swatch: 'bg-chart-profit-3' },
  { fill: 'fill-chart-profit-4', ink: 'fill-chart-profit-4-ink', swatch: 'bg-chart-profit-4' },
  { fill: 'fill-chart-profit-5', ink: 'fill-chart-profit-5-ink', swatch: 'bg-chart-profit-5' },
] as const;

export const LOSS_TONES: readonly ChartTone[] = [
  { fill: 'fill-chart-loss-1', ink: 'fill-chart-loss-1-ink', swatch: 'bg-chart-loss-1' },
  { fill: 'fill-chart-loss-2', ink: 'fill-chart-loss-2-ink', swatch: 'bg-chart-loss-2' },
  { fill: 'fill-chart-loss-3', ink: 'fill-chart-loss-3-ink', swatch: 'bg-chart-loss-3' },
  { fill: 'fill-chart-loss-4', ink: 'fill-chart-loss-4-ink', swatch: 'bg-chart-loss-4' },
  { fill: 'fill-chart-loss-5', ink: 'fill-chart-loss-5-ink', swatch: 'bg-chart-loss-5' },
] as const;

export const FLAT_TONE: ChartTone = {
  fill: 'fill-chart-flat',
  ink: 'fill-chart-flat-ink',
  swatch: 'bg-chart-flat',
};

/**
 * Text colour for the family. These are the app's own semantic pair rather than the
 * slice tones: the label sits on the card, where 4.5:1 is the requirement and these
 * are the values measured for it in the P&L cells.
 */
export const FAMILY_TEXT: Record<ToneFamily, string> = {
  profit: 'text-profit-dark dark:text-profit',
  loss: 'text-loss-dark dark:text-loss',
  flat: 'text-muted-foreground',
};

/** Which family a gain belongs to. `null` is "we don't know", so it is not a profit. */
export function toneFamily(gain: number | null | undefined): ToneFamily {
  if (gain === null || gain === undefined) return 'flat';
  if (gain > 0) return 'profit';
  if (gain < 0) return 'loss';
  return 'flat';
}

function pick(ladder: readonly ChartTone[], step: number): ChartTone {
  return ladder[step % ladder.length] ?? FLAT_TONE;
}

/**
 * Assign a tone to every slice, walking each family's ladder independently so that
 * gains and losses don't share a counter (which would make the walk depend on the
 * order they happen to sit in).
 */
export function assignTones<T extends { gain?: number | null }>(
  data: readonly T[]
): (T & { tone: ChartTone; family: ToneFamily })[] {
  let profitStep = 0;
  let lossStep = 0;
  return data.map((entry) => {
    const family = toneFamily(entry.gain);
    if (family === 'profit') return { ...entry, family, tone: pick(PROFIT_TONES, profitStep++) };
    if (family === 'loss') return { ...entry, family, tone: pick(LOSS_TONES, lossStep++) };
    return { ...entry, family, tone: FLAT_TONE };
  });
}

/**
 * Ladder for a breakdown that carries **no** profit/loss signal at all: the
 * dashboard's sector allocation counts holdings, so no slice is up or down and a
 * colour there is a category marker and nothing else.
 *
 * It is the brand-hue category ladder, *not* an alternation of the profit and loss
 * ladders. Green and red mean money in this app, and a composition chart has no
 * direction to report — painting half its slices green and half red would state a
 * gain or a loss that does not exist. Six distinguishable steps in the app's own
 * blue, and — the point of the ladder being a tokens object — every step hands over
 * the ink that stays legible *on it*. That is what the old white labels on
 * `CHART_COLORS` (measured 3.19:1 and 3.68:1 in the light theme) had no way to do:
 * a light fill in the dark theme needs dark ink, and only the tone knows.
 */
export const CATEGORY_TONES: readonly ChartTone[] = [
  { fill: 'fill-chart-cat-1', ink: 'fill-chart-cat-1-ink', swatch: 'bg-chart-cat-1' },
  { fill: 'fill-chart-cat-2', ink: 'fill-chart-cat-2-ink', swatch: 'bg-chart-cat-2' },
  { fill: 'fill-chart-cat-3', ink: 'fill-chart-cat-3-ink', swatch: 'bg-chart-cat-3' },
  { fill: 'fill-chart-cat-4', ink: 'fill-chart-cat-4-ink', swatch: 'bg-chart-cat-4' },
  { fill: 'fill-chart-cat-5', ink: 'fill-chart-cat-5-ink', swatch: 'bg-chart-cat-5' },
  { fill: 'fill-chart-cat-6', ink: 'fill-chart-cat-6-ink', swatch: 'bg-chart-cat-6' },
] as const;

/** The category tone for slice `index`, wrapping when a breakdown is longer than the ladder. */
export function categoryTone(index: number): ChartTone {
  return CATEGORY_TONES[index % CATEGORY_TONES.length] ?? FLAT_TONE;
}
