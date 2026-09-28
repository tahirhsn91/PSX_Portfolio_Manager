import type { ReactNode } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/utils';
import { useReducedMotion } from '@/hooks';
import { assignTones, categoryTone, FAMILY_TEXT, FLAT_TONE, type ChartTone, type ToneFamily } from './chartTones';
import { ChartSummary, type ChartSummaryItem } from './ChartSummary';

interface AllocationData {
  name: string;
  value: number;
  percent: number;
  /**
   * Ignored: a slice is painted from the token ladder, so no call site can put a
   * hardcoded hex back into the chart. Kept on the type because the pages build
   * these rows with the field.
   */
  color?: string;
  /**
   * Unrealised P&L of what this slice is made of, in PKR — the sign decides the
   * colour: green for a gain, red for a loss, slate for a priced position at
   * break-even. `null` means the feed couldn't price it, which is not a profit, so
   * it takes the slate too.
   *
   * Call sites that have no P&L to offer (the dashboard's allocation card) omit the
   * field entirely, and the slice is coloured from the category ladder instead.
   */
  gain?: number | null;
  /** The same figure as a percentage of cost, for the legend and the tooltip. */
  gainPercent?: number | null;
}

interface AllocationPieChartProps {
  data: AllocationData[];
  title?: string;
  valueLabel?: string;
  /**
   * Rendered opposite the title inside the card header — a view switch, so one
   * card can carry two breakdowns. Optional: the dashboard's call site passes
   * nothing and keeps the plain header.
   */
  headerExtra?: ReactNode;
  /** True while the first breakdown fetch is in flight — says so instead of drawing an empty pie. */
  isLoading?: boolean;
}

type Slice = AllocationData & { tone: ChartTone; family: ToneFamily };

/** `+PKR 12,345.67` / `-PKR 900.00`, and an em dash when the feed couldn't price it. */
function gainLabel(gain: number | null): string {
  if (gain === null) return '—';
  return `${gain > 0 ? '+' : ''}${formatCurrency(gain)}`;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: Slice }[] }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold">{item.name}</p>
      <p className="text-muted-foreground">{formatCurrency(item.value, true)}</p>
      <p className="text-muted-foreground">{formatPercent(item.percent, false)} of portfolio</p>
      {/* The qualitative signal, spelled out: the slice's colour says it too, but a
          colour is not something a screen reader or a colour-blind reader has. */}
      {item.gain !== undefined && (
        <p className={`mt-1 font-medium ${FAMILY_TEXT[item.family]}`}>
          P&amp;L {gainLabel(item.gain)}
          {item.gain !== null && item.gainPercent != null && (
            <span className="font-normal"> ({formatPercent(item.gainPercent)})</span>
          )}
        </p>
      )}
    </div>
  );
};

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  index?: number;
}

const SliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, slices }: LabelProps & { slices: Slice[] }) => {
  // Recharts 2.15 hands this callback `percent` already scaled to a percentage —
  // measured on the running app: a 2-of-3 sector arrives as 66.67 (the old
  // `percent * 100` rendered "6667%") and a 0.16% sliver arrives as 0.16. So use
  // it as-is; do NOT try to "normalise" it by magnitude, because a genuine
  // sub-1% slice is indistinguishable from a 0–1 fraction that way.
  const percentValue = percent;
  // Slivers below 5% aren't worth a label — they'd collide in the middle.
  if (!Number.isFinite(percentValue) || percentValue < 5) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  // The tone's own ink — the label sits *on* the slice, and only the tone knows
  // whether that needs light or dark text (a light fill in the dark theme needs
  // dark ink, which is why a fixed white could never clear 4.5:1 in both).
  const ink = (typeof index === 'number' ? slices[index]?.tone : undefined)?.ink ?? FLAT_TONE.ink;
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold" className={ink}>
      {`${percentValue.toFixed(0)}%`}
    </text>
  );
};

export function AllocationPieChart({ data, title = 'Portfolio Allocation', headerExtra, isLoading = false }: AllocationPieChartProps) {
  const reduced = useReducedMotion();

  /**
   * Two palettes, chosen by whether the data can answer "did this make money":
   *
   *  - With P&L, the slice is green or red by sign and the tone tells one slice from
   *    the next. This is what the portfolio's Holdings and Sector breakdowns use —
   *    one green for every profitable holding made them impossible to tell apart.
   *  - Without it (the dashboard's allocation card, which counts holdings per
   *    sector), the **category ladder** — still tokens, still each step's own ink,
   *    and no `CHART_COLORS` cycling palette painting white 11px labels onto fills
   *    that measured 3.19:1 and 3.68:1 in the light theme.
   */
  const hasGain = data.some((d) => d.gain !== undefined);
  const chartData: Slice[] = hasGain
    ? assignTones(data)
    : data.map((entry, index) => ({
        ...entry,
        family: 'flat' as ToneFamily,
        tone: categoryTone(index),
      }));

  const total = chartData.reduce((sum, entry) => sum + (Number.isFinite(entry.value) ? entry.value : 0), 0);
  const hasData = chartData.length > 0 && total > 0;

  const topSlices = [...chartData].sort((a, b) => b.value - a.value);
  const summaryItems: ChartSummaryItem[] = hasData
    ? [
        ...topSlices.slice(0, 6).map((slice) => ({
          label: slice.name,
          value: `${formatPercent(slice.percent, false)} · ${formatCurrency(slice.value, true)}${
            hasGain && slice.gain !== undefined && slice.gainPercent != null ? ` · ${formatPercent(slice.gainPercent)}` : ''
          }`,
          tone: slice.family,
        })),
        ...(topSlices.length > 6 ? [{ label: 'Other slices', value: `${topSlices.length - 6} more` }] : []),
      ]
    : [];

  // Why there is no pie differs by cause, so name the cause.
  const emptyReason = data.length === 0
    ? 'No allocation to show yet — this breakdown is built from a portfolio’s holdings, so it fills in once one has a holding.'
    : 'Every slice came back worth nothing at the feed’s last prices, so there is no split to draw.';

  return (
    <Card>
      {/* space-y-0 + row: the switch sits on the title's baseline rather than under it. */}
      <CardHeader className={headerExtra ? 'flex flex-row items-center justify-between space-y-0' : undefined}>
        <CardTitle className="text-base">{title}</CardTitle>
        {headerExtra}
      </CardHeader>
      <CardContent>
        {isLoading && !hasData ? (
          <p className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            Loading allocation…
          </p>
        ) : !hasData ? (
          <p className="flex h-[320px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyReason}
          </p>
        ) : (
          <>
            {/* Height is 320 not 280: the legend for a 7-sector portfolio wraps to ~3 rows
                (~96px), and that space is taken off the plot area *before* the pie is laid
                out, so the circle had 184px of height to live in. */}
            <div
              role="group"
              aria-label={`${title}: ${chartData.length} slices, largest is ${topSlices[0]?.name} at ${formatPercent(topSlices[0]?.percent ?? 0, false)}`}
            >
              <ResponsiveContainer width="100%" height={320}>
                <PieChart accessibilityLayer>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={((props: LabelProps) => <SliceLabel {...props} slices={chartData} />) as unknown as boolean}
                    /* Percentage, not a fixed radius. A number is used verbatim, while
                       recharts resolves a string against maxPieRadius =
                       getMaxRadius(plotWidth, plotHeight) = min(w, h) / 2 of the
                       legend-adjusted plot area, so the circle shrinks to fit instead of
                       spilling out of the SVG. With outerRadius={110} a 7-sector legend
                       left 184px for a 220px circle: the top 18px (42px at a 1024 viewport)
                       was cut off by the SVG edge. 88% keeps a visible margin. */
                    outerRadius="88%"
                    dataKey="value"
                    nameKey="name"
                    isAnimationActive={!reduced}
                  >
                    {chartData.map((entry, index) => (
                      // A class, not a `fill` attribute: the tone is a CSS variable, so the
                      // same slice is correct in the light and the dark theme — and the
                      // in-slice label reads its ink off the same tone.
                      <Cell key={`cell-${index}`} className={entry.tone.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  {/* A custom legend rather than the built-in one: its swatch is drawn from
                      the slice's `fill` *prop*, and the tones are set as classes (they have
                      to be, or the light/dark variables never resolve), so the default
                      swatches came out the SVG default grey. This also gives each entry the
                      signed return, so the legend still says green/red to a reader who
                      can't see green or red. */}
                  <Legend
                    content={() => (
                      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2">
                        {chartData.map((entry, index) => (
                          <li key={`legend-${index}`} className="flex items-center gap-1.5 text-xs text-foreground">
                            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${entry.tone.swatch}`} />
                            <span>{entry.name}</span>
                            {hasGain && entry.gain !== undefined && entry.gainPercent != null && (
                              <span className={`font-medium ${FAMILY_TEXT[entry.family]}`}>{formatPercent(entry.gainPercent)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ChartSummary caption="Largest slices" items={summaryItems} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
