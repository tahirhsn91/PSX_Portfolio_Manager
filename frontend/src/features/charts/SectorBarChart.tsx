import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useReducedMotion } from '@/hooks';
import { ChartSummary, type ChartSummaryItem } from './ChartSummary';
import { useChartTokens, useToneFills } from './useChartTokens';

interface SectorData {
  sector: string;
  changePercent: number;
}

interface SectorBarChartProps {
  data: SectorData[];
  title?: string;
  /** True while the first sector fetch is in flight — says so instead of drawing bare axes. */
  isLoading?: boolean;
}

/** `+1.23%` / `-0.45%` / `0.00%` — the sign is text, so it survives a colourblind reader. */
const signedPercent = (value: number, decimals = 2): string =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value).toFixed(decimals)}%`;

/** Left gutter for the full sector names, in px. The plot is what is left of the card. */
const Y_AXIS_WIDTH = 152;

/**
 * Round ticks for a diverging percentage axis. Recharts' auto ticks follow the
 * padded domain (`-1.25% / 0.75% / 4.33%`), which reads like a scale rather than a
 * set of figures; stepping the 1–2–5 ladder keeps them on round numbers and — the
 * point of the chart — always puts zero on the axis.
 */
function axisTicks(min: number, max: number): number[] {
  const rough = (max - min || 1) / 6;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

/** Tone for a move's direction — green up, red down, flat grey. A class, so both themes resolve it. */
const toneClass = (changePercent: number): string =>
  changePercent > 0 ? 'fill-chart-profit-3' : changePercent < 0 ? 'fill-chart-loss-3' : 'fill-chart-flat';

interface Row extends SectorData {
  /** The name as the feed states it, full length: `sector` used to be cut to initials to fit the axis. */
  fullSector: string;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { value: number; payload: Row }[] }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-medium">{row.fullSector}</p>
      <p className={row.changePercent > 0 ? 'text-profit' : row.changePercent < 0 ? 'text-loss' : 'text-muted-foreground'}>
        {signedPercent(row.changePercent)}
      </p>
    </div>
  );
};

interface AxisTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string };
}

/**
 * Wrap a sector name onto at most two lines at 12px. The chart is horizontal, so
 * the name sits in the left gutter at full length rather than rotated under a
 * column; 23 characters a line covers the longest PSX names ("OIL & GAS
 * EXPLORATION COMPANIES"), and anything past two lines is clipped with an
 * ellipsis — the full name is still in the tooltip and in the summary below.
 */
function wrapSectorName(name: string, perLine = 23, maxLines = 2): string[] {
  const words = name.split(/[\s/]+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= perLine) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines && clipped.length > 0) {
    const lastIndex = clipped.length - 1;
    clipped[lastIndex] = `${clipped[lastIndex].slice(0, perLine - 1)}…`;
  }
  return clipped;
}

const SectorTick = ({ x = 0, y = 0, payload }: AxisTickProps) => {
  const lines = wrapSectorName(payload?.value ?? '');
  return (
    <text x={x} y={y} textAnchor="end" fontSize={12} className="fill-muted-foreground">
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? (lines.length === 1 ? 4 : -2) : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
};

interface BarLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}

/** The move, printed just past the end of its own bar — the sign never rests on the colour. */
const SignedBarLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0 }: BarLabelProps) => {
  const gained = value >= 0;
  // In a diverging horizontal bar Recharts hands `width` the sign of the value, so
  // the far end is the larger of x and x + width whichever direction the bar runs.
  const start = Math.min(x, x + width);
  const end = Math.max(x, x + width);
  const anchorX = gained ? end + 6 : start - 6;
  return (
    <text
      x={anchorX}
      y={y + height / 2}
      textAnchor={gained ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
      className="fill-muted-foreground"
    >
      {signedPercent(value)}
    </text>
  );
};

export function SectorBarChart({ data, title = 'Sector Performance', isLoading = false }: SectorBarChartProps) {
  const reduced = useReducedMotion();
  // The zero baseline is a series-coloured line, not a class: recharts puts its own
  // `stroke` attribute on a ReferenceLine, and an attribute beats an inherited class.
  const tokens = useChartTokens();
  const toneFills = useToneFills();
  const chartRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  // A label printed past the last bar needs a fixed number of pixels, and how many
  // data units that is depends on the card's width — so the plot is measured rather
  // than assumed. Without ResizeObserver (jsdom) the 360px fallback is used.
  useEffect(() => {
    const node = chartRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setPlotWidth(Math.max(0, entry.contentRect.width - Y_AXIS_WIDTH - 16));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data.length]);

  const rows: Row[] = [...data]
    .sort((a, b) => b.changePercent - a.changePercent)
    .map((d) => ({ ...d, fullSector: d.sector }));

  const hasData = rows.length > 0;
  const gainers = rows.filter((r) => r.changePercent > 0);
  const losers = rows.filter((r) => r.changePercent < 0);

  const values = rows.map((r) => r.changePercent);
  const dataMax = Math.max(0, ...values);
  const dataMin = Math.min(0, ...values);
  const span = dataMax - dataMin || 1;
  // Reserve 56px outside each extreme bar for its label, converted into data units
  // at the measured plot width: a share of the domain alone clips on a phone.
  const padUnits = (56 / (plotWidth > 0 ? plotWidth : 360)) * span;
  const domain: [number, number] = [
    dataMin === 0 ? -padUnits * 0.2 : dataMin - padUnits,
    dataMax === 0 ? padUnits * 0.2 : dataMax + padUnits,
  ];
  // A row is 30px: two wrapped label lines plus their gap.
  const height = Math.max(300, rows.length * 30 + 20);

  // Best gainers and worst losers: the shape of a session without repeating the chart.
  const movers = [...gainers, ...losers.slice().reverse()];
  const summaryItems: ChartSummaryItem[] = hasData
    ? [
        ...movers.slice(0, 6).map((row) => ({
          label: row.fullSector,
          value: signedPercent(row.changePercent),
          tone: (row.changePercent > 0 ? 'profit' : row.changePercent < 0 ? 'loss' : 'flat') as ChartSummaryItem['tone'],
        })),
        { label: 'Sectors plotted', value: `${rows.length} (${gainers.length} up, ${losers.length} down)` },
      ]
    : [];

  // Bare axes leave a reader guessing whether the market is flat or the fetch
  // failed, so the card says which it is.
  const emptyReason = data.length === 0
    ? 'No sector performance for this session yet — the feed publishes it once the market has traded.'
    : 'Sector values came back empty for this session — every row was missing a percentage change.';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !hasData ? (
          <div className="space-y-3 py-4" aria-busy="true">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
        ) : !hasData ? (
          <p className="flex h-[300px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyReason}
          </p>
        ) : (
          <>
            <div
              ref={chartRef}
              role="group"
              aria-label={`${title}: percentage change for ${rows.length} sectors, ${gainers.length} up and ${losers.length} down`}
            >
              <ResponsiveContainer width="100%" height={height}>
                <BarChart
                  accessibilityLayer
                  layout="vertical"
                  data={rows}
                  margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={domain}
                    ticks={axisTicks(domain[0], domain[1])}
                    /* Rounded: the padded domain makes a tick something like
                       2.8359369%, which is a scale, not a stated figure. */
                    tickFormatter={(v) => `${Number(v.toFixed(2))}%`}
                    tick={{ fontSize: 12, fill: tokens.axis }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="fullSector"
                    tick={<SectorTick />}
                    tickLine={false}
                    axisLine={false}
                    width={Y_AXIS_WIDTH}
                    interval={0}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {/* The zero line: a sector that lost ground sits left of it, whichever tone it takes. */}
                  <ReferenceLine x={0} stroke={tokens.neutral} strokeOpacity={0.6} />
                  <Bar
                    dataKey="changePercent"
                    barSize={16}
                    radius={3}
                    isAnimationActive={!reduced}
                    label={<SignedBarLabel />}
                  >
                    {rows.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={toneFills[toneClass(entry.changePercent)] ?? 'currentColor'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-chart-profit-3" />
                Gained
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-chart-loss-3" />
                Lost
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-chart-flat" />
                Unchanged
              </span>
              <span>Every bar is signed (+/−), so the direction reads without the colour.</span>
            </div>
            <ChartSummary caption="Largest sector moves" items={summaryItems} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
