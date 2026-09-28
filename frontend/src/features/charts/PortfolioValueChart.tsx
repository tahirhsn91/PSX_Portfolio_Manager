import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatCompactNumber } from '@/utils';
import { useReducedMotion } from '@/hooks';
import type { HistoricalDataPoint } from '@/types';
import { ChartSummary, type ChartSummaryItem } from './ChartSummary';
import { useChartTokens } from './useChartTokens';

interface PortfolioValueChartProps {
  /**
   * The portfolio's own value per session, oldest first, in PKR — as returned by
   * `buildPortfolioValueSeries`. Values are already the portfolio's worth, so this
   * chart must NOT scale them again: it used to be handed the KSE-100's index
   * points plus a share count and multiply the two, which printed an index level
   * times a share count as if it were the portfolio's value (a 0.5M portfolio
   * charted around 258M).
   */
  series: HistoricalDataPoint[];
  title?: string;
  /** The selected window, so the card can say when history is shorter than it. */
  rangeDays?: number;
  /** True while the first value fetch is in flight — says so instead of drawing an empty plot. */
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-medium">{label}</p>
      {/* The complete value, as the tiles show it — rounding a figure the user is
          reading off the chart is the inaccuracy this chart was fixed for. */}
      <p className="text-primary font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export function PortfolioValueChart({ series, title = 'Portfolio Value', rangeDays, isLoading = false }: PortfolioValueChartProps) {
  const reduced = useReducedMotion();
  // The stroke and both gradient stops have to be real colours: recharts writes
  // them into SVG attributes (`stroke`, `stop-color`), where a CSS `var()` — and
  // the Tailwind class that wraps one — never resolves.
  const tokens = useChartTokens();

  // A series that starts after the window opened is limited by what the feed has, not
  // by what the portfolio owned — say so instead of letting the line look complete.
  const windowStart = rangeDays ? format(subDays(new Date(), rangeDays), 'yyyy-MM-dd') : null;
  const seriesStart = series[0]?.date ?? null;
  const limitedFrom = windowStart && seriesStart && seriesStart > windowStart ? seriesStart : null;

  // Use last 90 days, and only sessions the feed actually priced.
  const chartData = series
    .slice(-90)
    .filter((d) => Number.isFinite(d.close))
    .map((d) => ({
      date: format(new Date(d.date), 'MMM dd'),
      value: +d.close.toFixed(2),
    }));

  const hasData = chartData.length > 0;
  const values = chartData.map((d) => d.value);
  // Only ever computed over a non-empty array: `Math.min(...[])` is `Infinity`, and
  // that used to reach recharts as the Y domain when there was nothing to plot.
  const minVal = hasData ? Math.min(...values) : 0;
  const maxVal = hasData ? Math.max(...values) : 0;
  const currentValue = chartData[chartData.length - 1]?.value ?? 0;
  const firstValue = chartData[0]?.value ?? 0;
  const isPositive = currentValue >= firstValue;
  const changePercent = firstValue !== 0 ? (currentValue / firstValue - 1) * 100 : 0;

  const summaryItems: ChartSummaryItem[] = hasData
    ? [
        { label: `Sessions plotted`, value: `${chartData.length}` },
        { label: 'Opening value', value: formatCurrency(firstValue) },
        { label: 'Latest value', value: formatCurrency(currentValue) },
        {
          label: 'Change over window',
          value: `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
          tone: changePercent > 0 ? 'profit' : changePercent < 0 ? 'loss' : 'flat',
        },
        { label: 'High / low', value: `${formatCurrency(maxVal)} / ${formatCurrency(minVal)}` },
      ]
    : [];

  // Why the plot is empty differs by cause, so name the cause.
  const emptyReason = series.length === 0
    ? 'No portfolio value history yet — add a holding with a purchase date, and the line appears once the feed prices it.'
    : 'The feed has not published a close for these holdings in this window, so there is no value to plot for it.';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {limitedFrom && (
          <p className="text-xs text-muted-foreground">
            Limited by available history — closes start {format(new Date(limitedFrom), 'd MMM yyyy')}{' '}
            ({series.length} sessions).
          </p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && !hasData ? (
          <p className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            Loading portfolio value…
          </p>
        ) : !hasData ? (
          <p className="flex h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyReason}
          </p>
        ) : (
          <>
            <div role="group" aria-label={`${title} over the last ${chartData.length} sessions, ${isPositive ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}% over the window`}>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart accessibilityLayer data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? tokens.up : tokens.down} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={isPositive ? tokens.up : tokens.down} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    /* Axis ticks stay abbreviated — they are a scale, not a stated value —
                       and the domain is only ever built from a non-empty series. */
                    tickFormatter={(v) => formatCompactNumber(v)}
                    tick={{ fontSize: 12, fill: tokens.axis }}
                    tickLine={false}
                    axisLine={false}
                    domain={[minVal * 0.95, maxVal * 1.05]}
                    className="fill-muted-foreground"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={isPositive ? tokens.up : tokens.down}
                    strokeWidth={2}
                    fill="url(#colorValue)"
                    isAnimationActive={!reduced}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <ChartSummary caption="Portfolio value — window summary" items={summaryItems} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
