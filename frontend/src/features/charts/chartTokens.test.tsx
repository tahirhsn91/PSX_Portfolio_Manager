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
 *  - The card shell: loading skeleton, per-cause empty copy, and the text summary of
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
  'fill-chart-profit-2': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-profit-3': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-profit-4': { light: '#0f1110', dark: '#ffffff' },
  'fill-chart-profit-5': { light: '#0f1110', dark: '#0f1110' },
  'fill-chart-loss-1': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-loss-2': { light: '#ffffff', dark: '#ffffff' },
  'fill-chart-loss-3': { light: '#0f1110', dark: '#ffffff' },
  'fill-chart-loss-4': { light: '#0f1110', dark: '#0f1110' },
  'fill-chart-loss-5': { light: '#0f1110', dark: '#0f1110' },
  'fill-chart-flat': { light: '#ffffff', dark: '#0f1110' },
  'fill-chart-cat-1': { light: '#ffffff', dark: '#0f1110' },
  'fill-chart-cat-2': { light: '#ffffff', dark: '#0f1110' },
  'fill-chart-cat-3': { light: '#ffffff', dark: '#0f1110' },
  'fill-chart-cat-4': { light: '#ffffff', dark: '#0f1110' },
  'fill-chart-cat-5': { light: '#0f1110', dark: '#0f1110' },
  'fill-chart-cat-6': { light: '#0f1110', dark: '#0f1110' },
};

const FILL_BY_TONE: Record<string, { light: string; dark: string }> = {
  'fill-chart-profit-1': { light: '#003A21', dark: '#0B2E1F' },
  'fill-chart-profit-2': { light: '#007A42', dark: '#123F2A' },
  'fill-chart-profit-3': { light: '#067843', dark: '#1A5337' },
  'fill-chart-profit-4': { light: '#1B9E5B', dark: '#236846' },
  'fill-chart-profit-5': { light: '#3AB772', dark: '#32CE8A' },
  'fill-chart-loss-1': { light: '#8E151A', dark: '#3A1619' },
  'fill-chart-loss-2': { light: '#D62F35', dark: '#4E1B1F' },
  'fill-chart-loss-3': { light: '#DF4A50', dark: '#662327' },
  'fill-chart-loss-4': { light: '#E9686D', dark: '#F4747A' },
  'fill-chart-loss-5': { light: '#F28589', dark: '#F99A9E' },
  'fill-chart-flat': { light: '#6B6B6B', dark: '#A8ADAB' },
  'fill-chart-cat-1': { light: '#3F3F3F', dark: '#838885' },
  'fill-chart-cat-2': { light: '#666666', dark: '#A8ADAB' },
  'fill-chart-cat-3': { light: '#6E6E6E', dark: '#B9BDBC' },
  'fill-chart-cat-4': { light: '#737373', dark: '#C9CCCB' },
  'fill-chart-cat-5': { light: '#8A8A8A', dark: '#D8DBDA' },
  'fill-chart-cat-6': { light: '#9A9A9A', dark: '#E5E7E6' },
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
    expect(loading).toContain('animate-shimmer');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('No price history');
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
    expect(renderToStaticMarkup(<SectorBarChart data={[]} isLoading />)).toContain('animate-shimmer');

    const html = renderToStaticMarkup(
      <SectorBarChart data={[{ sector: 'REFINERY', changePercent: 2.5 }, { sector: 'CEMENT', changePercent: -1.25 }]} />,
    );
    expect(html).toContain('+2.50%');
    expect(html).toContain('-1.25%');
    expect(html).toContain('Sectors plotted');
  });

  it('separates a portfolio value chart with no history from one the feed never priced', () => {
    expect(renderToStaticMarkup(<PortfolioValueChart series={[]} />)).toContain('No portfolio value history yet');
    expect(renderToStaticMarkup(<PortfolioValueChart series={[]} isLoading />)).toContain('animate-shimmer');
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
    expect(renderToStaticMarkup(<AllocationPieChart data={[]} isLoading />)).toContain('animate-shimmer');
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
