import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useReducedMotion } from '@/hooks';
import { ChartSummary, type ChartSummaryItem } from './ChartSummary';
import { useChartTokens } from './useChartTokens';

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
 * Wrap a sector name onto at most three lines at 12px. Feed names run to 40
 * characters (`INV. BANKS / INV. COS. / SECURITIES COS.`) against ~26px of column
 * per bar, so anything past three lines is clipped with an ellipsis — the full
 * name is still in the tooltip and in the summary list under the chart.
 */
function wrapSectorName(name: string, perLine = 14, maxLines = 3): string[] {
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

const SectorTick = ({ x = 0, y = 0, payload }: AxisTickProps) => (
  <text
    transform={`translate(${x},${y}) rotate(-45)`}
    textAnchor="end"
    fontSize={12}
    className="fill-muted-foreground"
  >
    {wrapSectorName(payload?.value ?? '').map((line, index) => (
      <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 6 : 12}>
        {line}
      </tspan>
    ))}
  </text>
);

interface BarLabelProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
  /** Set when the columns are narrow: one decimal fits between two bars, two do not. */
  decimals?: number;
  /** Set when the chart carries more bars than a 40px label can sit between sideways. */
  dense?: boolean;
}

/** The move, printed at the end of its own bar — the sign never rests on the colour. */
const SignedBarLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0, decimals = 2, dense = false }: BarLabelProps) => {
  const gained = value >= 0;
  const centreX = x + width / 2;
  const anchorY = gained ? y - 4 : y + height + 4;
  return (
    <text
      x={centreX}
      y={anchorY}
      /* A session that reports 30+ sectors leaves ~22px a column, which a sideways
         `+2.2%` (~30px) would overlap its neighbour with. Rotated, the label owns
         its own column; the padded Y domain leaves the headroom it needs, so it
         sits entirely outside the bar instead of over another one. */
      transform={dense ? `rotate(-90 ${centreX} ${anchorY})` : undefined}
      textAnchor={dense ? (gained ? 'start' : 'end') : 'middle'}
      fontSize={12}
      className="fill-muted-foreground"
    >
      {signedPercent(value, decimals)}
    </text>
  );
};

export function SectorBarChart({ data, title = 'Sector Performance', isLoading = false }: SectorBarChartProps) {
  const reduced = useReducedMotion();
  // The zero baseline is a series-coloured line, not a class: recharts puts its own
  // `stroke` attribute on a ReferenceLine, and an attribute beats an inherited class.
  const tokens = useChartTokens();

  const rows: Row[] = [...data]
    .sort((a, b) => b.changePercent - a.changePercent)
    .map((d) => ({ ...d, fullSector: d.sector }));

  const hasData = rows.length > 0;
  const gainers = rows.filter((r) => r.changePercent > 0);
  const losers = rows.filter((r) => r.changePercent < 0);

  const values = rows.map((r) => r.changePercent);
  // Pad the domain so the value label at the tallest and deepest bar has room
  // inside the plot instead of spilling over the axis.
  const pad = 1.45;
  const dataMax = Math.max(0, ...values);
  const dataMin = Math.min(0, ...values);
  const domain: [number, number] = [dataMin * pad, dataMax * pad];
  // Thirty sectors across one card leaves ~22px a column: one decimal keeps two
  // neighbouring labels from colliding, and past a dozen bars the label turns to
  // run up its own column.
  const decimals = rows.length > 20 ? 1 : 2;
  const dense = rows.length > 12;

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
          <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Loading sector performance…
          </p>
        ) : !hasData ? (
          <p className="flex h-[300px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyReason}
          </p>
        ) : (
          <>
            <div
              role="group"
              aria-label={`${title}: percentage change for ${rows.length} sectors, ${gainers.length} up and ${losers.length} down`}
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart accessibilityLayer data={rows} margin={{ top: 16, right: 6, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="fullSector" tick={<SectorTick />} tickLine={false} interval={0} height={104} />
                  <YAxis
                    /* Rounded: the padded domain makes the top tick something like
                       2.8359369%, which is a scale, not a stated figure. */
                    tickFormatter={(v) => `${Number(v.toFixed(2))}%`}
                    tick={{ fontSize: 12, fill: tokens.axis }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                    domain={domain}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  {/* The zero line: a sector that lost ground sits below it, whichever tone it takes. */}
                  <ReferenceLine y={0} stroke={tokens.neutral} strokeOpacity={0.6} />
                  <Bar
                    dataKey="changePercent"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={!reduced}
                    label={<SignedBarLabel decimals={decimals} dense={dense} />}
                  >
                    {rows.map((entry, index) => (
                      <Cell key={`cell-${index}`} className={toneClass(entry.changePercent)} fillOpacity={0.85} />
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
