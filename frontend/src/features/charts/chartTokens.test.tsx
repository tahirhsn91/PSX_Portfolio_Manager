import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AllocationPieChart } from './AllocationPieChart';
import { PortfolioValueChart } from './PortfolioValueChart';
import { SectorBarChart } from './SectorBarChart';
import { StockPriceChart } from './StockPriceChart';
import {
  CATEGORY_TONES,
  FLAT_TONE,
  LOSS_TONES,
  PROFIT_TONES,
  assignTones,
  categoryTone,
  type ChartTone,
} from './chartTones';

/*
 * What these cover, and why they are static-markup renders rather than a DOM:
 *
 *  - The tone/ink wiring. A slice's fill and the ink drawn on it are two classes
 *    from the same tone object; pairing them wrongly is exactly the defect that
 *    shipped (white 11px labels on `CHART_COLORS`, measured 3.19:1 and 3.68:1).
 *  - The card shell: loading copy, per-cause empty copy, and the text summary of
 *    a chart's own figures. Those are the parts a tooltip-only chart never gave a
 *    keyboard or screen-reader user. The SVG itself needs a laid-out container, so
 *    it is out of scope here — it is verified against the running app instead.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The ink each tone's fill takes, per theme: `--chart-*-ink` in index.css, keyed by the
 * fill class. These two tables mirror that stylesheet because jsdom does not resolve
 * `hsl(var(--x))`, and the SVG needs a laid-out container either way — so the values are
 * restated here to be *asserted*. `theme/themeTokens.test.ts` is the other half: it
 * parses index.css itself and checks the stylesheet against the shared palette, so a
 * variable edited in one place and not the other fails there.
 */
const INK_BY_FILL: Record<string, { light: string; dark: string }> = {
  'fill-chart-profit-1': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-profit-2': { light: '#ffffff', dark: '#020f08' },
  'fill-chart-profit-3': { light: '#ffffff', dark: '#020f08' },
  'fill-chart-profit-4': { light: '#ffffff', dark: '#020f08' },
  'fill-chart-profit-5': { light: '#020f08', dark: '#020f08' },
  'fill-chart-loss-1': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-loss-2': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-loss-3': { light: '#ffffff', dark: '#2a0606' },
  'fill-chart-loss-4': { light: '#ffffff', dark: '#2a0606' },
  'fill-chart-loss-5': { light: '#ffffff', dark: '#2a0606' },
  'fill-chart-flat': { light: '#ffffff', dark: '#0f172a' },
  'fill-chart-cat-1': { light: '#ffffff', dark: '#0b1220' },
  'fill-chart-cat-2': { light: '#ffffff', dark: '#0b1220' },
  'fill-chart-cat-3': { light: '#ffffff', dark: '#0b1220' },
  'fill-chart-cat-4': { light: '#ffffff', dark: '#0b1220' },
  'fill-chart-cat-5': { light: '#ffffff', dark: '#0b1220' },
  'fill-chart-cat-6': { light: '#ffffff', dark: '#0b1220' },
};

const FILL_BY_TONE: Record<string, { light: string; dark: string }> = {
  'fill-chart-profit-1': { light: '#166534', dark: '#15803d' },
  'fill-chart-profit-2': { light: '#15803D', dark: '#16a34a' },
  'fill-chart-profit-3': { light: '#065f46', dark: '#22c55e' },
  'fill-chart-profit-4': { light: '#047857', dark: '#34d399' },
  'fill-chart-profit-5': { light: '#059669', dark: '#4ADE80' },
  // The first dark loss tone was #b91c1c, which measured 2.63 against the dark card —
  // under the 3:1 a shape needs. Nothing asserted it until this file covered the money
  // ladders as well as the category one.
  'fill-chart-loss-1': { light: '#991b1b', dark: '#E11D48' },
  'fill-chart-loss-2': { light: '#C81E1E', dark: '#dc2626' },
  'fill-chart-loss-3': { light: '#dc2626', dark: '#ef4444' },
  'fill-chart-loss-4': { light: '#be123c', dark: '#F87171' },
  'fill-chart-loss-5': { light: '#e11d48', dark: '#fca5a5' },
  'fill-chart-flat': { light: '#5A6A7D', dark: '#7C8BA0' },
  'fill-chart-cat-1': { light: '#1E3A8A', dark: '#3B82F6' },
  'fill-chart-cat-2': { light: '#0B5FA5', dark: '#60A5FA' },
  'fill-chart-cat-3': { light: '#2563EB', dark: '#93C5FD' },
  'fill-chart-cat-4': { light: '#4338CA', dark: '#A5B4FC' },
  'fill-chart-cat-5': { light: '#0369A1', dark: '#7DD3FC' },
  'fill-chart-cat-6': { light: '#155E75', dark: '#BFDBFE' },
};

function luminance(hex: string): number {
  expect(hex).toMatch(HEX);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('chart tone ink', () => {
  it('paints every tone with an ink that clears 4.5:1 on that tone, in both themes', () => {
    // Every ladder, not just the category one: the money ladders are the ones a reader
    // actually leans on, and they had no coverage here until the palette change.
    const tones: ChartTone[] = [...PROFIT_TONES, ...LOSS_TONES, ...CATEGORY_TONES, FLAT_TONE];
    for (const theme of ['light', 'dark'] as const) {
      for (const tone of tones) {
        const fill = FILL_BY_TONE[tone.fill]?.[theme];
        const ink = INK_BY_FILL[tone.fill]?.[theme];
        expect(fill, `unknown fill ${tone.fill}`).toBeDefined();
        expect(ink, `no ink recorded for ${tone.fill}`).toBeDefined();
        // The label must wear *its own* tone's ink, not another step's.
        expect(tone.ink).toBe(tone.fill === 'fill-chart-flat' ? 'fill-chart-flat-ink' : `${tone.fill}-ink`);
        expect(contrast(fill, ink), `${tone.fill} on ${tone.ink} (${theme})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('never pairs two slices in one breakdown with the same tone', () => {
    const breakdown = Array.from({ length: 6 }, (_, i) => categoryTone(i));
    expect(new Set(breakdown.map((t) => t.fill)).size).toBe(breakdown.length);
  });

  it('takes the family from the sign of the gain, and flat for an unknown one', () => {
    const [up, down, unknown] = assignTones([{ gain: 12 }, { gain: -3 }, { gain: null }]);
    expect(up.family).toBe('profit');
    expect(down.family).toBe('loss');
    expect(unknown.family).toBe('flat');
    expect(unknown.tone.ink).toBe('fill-chart-flat-ink');
  });
});

describe('chart empty, loading and summary states', () => {
  it('says why a price chart has nothing to plot instead of drawing an empty axis', () => {
    const noHistory = renderToStaticMarkup(<StockPriceChart data={[]} symbol="ENGRO" />);
    expect(noHistory).toContain('No price history for ENGRO yet');
    expect(noHistory).not.toContain('aria-label="ENGRO close price');

    const loading = renderToStaticMarkup(<StockPriceChart data={[]} symbol="ABL" isLoading />);
    expect(loading).toContain('Loading ABL price history');
  });

  it('puts a price chart&apos;s figures in the DOM as text, signed and labelled', () => {
    const html = renderToStaticMarkup(
      <StockPriceChart
        data={[
          { date: '2026-09-01', close: 100, volume: 5, open: 99, high: 101, low: 98 },
          { date: '2026-09-02', close: 110, volume: 6, open: 100, high: 111, low: 99 },
        ]}
        symbol="ABL"
        purchasePrice={105}
      />,
    );
    expect(html).toContain('Last close (ABL)');
    expect(html).toContain('+10.00%');
    expect(html).toContain('Purchase price');
  });

  it('reports a sector session it cannot plot, and signs its summary values', () => {
    expect(renderToStaticMarkup(<SectorBarChart data={[]} />)).toContain('No sector performance for this session yet');
    expect(renderToStaticMarkup(<SectorBarChart data={[]} isLoading />)).toContain('Loading sector performance');

    const html = renderToStaticMarkup(
      <SectorBarChart data={[{ sector: 'REFINERY', changePercent: 2.5 }, { sector: 'CEMENT', changePercent: -1.25 }]} />,
    );
    expect(html).toContain('+2.50%');
    expect(html).toContain('-1.25%');
    expect(html).toContain('Sectors plotted');
  });

  it('separates a portfolio value chart with no history from one the feed never priced', () => {
    expect(renderToStaticMarkup(<PortfolioValueChart series={[]} />)).toContain('No portfolio value history yet');
    expect(renderToStaticMarkup(<PortfolioValueChart series={[]} isLoading />)).toContain('Loading portfolio value');
    expect(
      renderToStaticMarkup(<PortfolioValueChart series={[{ date: '2026-09-01', close: Number.NaN, volume: 0, open: 0, high: 0, low: 0 }]} />),
    ).toContain('has not published a close');
  });

  it('summarises a portfolio value window in text', () => {
    const html = renderToStaticMarkup(
      <PortfolioValueChart
        series={[
          { date: '2026-09-01', close: 1000, volume: 0, open: 0, high: 0, low: 0 },
          { date: '2026-09-02', close: 1250, volume: 0, open: 0, high: 0, low: 0 },
        ]}
      />,
    );
    expect(html).toContain('Latest value');
    expect(html).toContain('+25.00%');
  });

  it('names the cause when an allocation has nothing to draw', () => {
    expect(renderToStaticMarkup(<AllocationPieChart data={[]} />)).toContain('No allocation to show yet');
    expect(renderToStaticMarkup(<AllocationPieChart data={[]} isLoading />)).toContain('Loading allocation');
  });

  it('summarises the slices it drew, with the signed return where there is one', () => {
    const html = renderToStaticMarkup(
      <AllocationPieChart
        data={[
          { name: 'ABL', value: 900, percent: 90, gain: 120, gainPercent: 15.4 },
          { name: 'AGHA', value: 100, percent: 10, gain: -8, gainPercent: -2.1 },
        ]}
      />,
    );
    expect(html).toContain('Largest slices');
    expect(html).toContain('largest is ABL');
    expect(html).toContain('+15.40%');
    expect(html).toContain('-2.10%');
  });

  it('keeps the dashboard allocation (no P&L) on the token ladder, not a caller colour', () => {
    const html = renderToStaticMarkup(
      <AllocationPieChart
        data={[
          { name: 'Commercial Banks', value: 3, percent: 60, color: '#00a651' },
          { name: 'Cement', value: 2, percent: 40, color: '#3b82f6' },
        ]}
      />,
    );
    expect(html).not.toContain('#00a651');
    expect(html).not.toContain('#3b82f6');
    expect(html).toContain('Commercial Banks');
  });
});
