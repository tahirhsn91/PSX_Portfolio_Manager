import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatCompactNumber } from '@/utils';
import type { HistoricalDataPoint } from '@/types';

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

export function PortfolioValueChart({ series, title = 'Portfolio Value', rangeDays }: PortfolioValueChartProps) {
  // A series that starts after the window opened is limited by what the feed has, not
  // by what the portfolio owned — say so instead of letting the line look complete.
  const windowStart = rangeDays ? format(subDays(new Date(), rangeDays), 'yyyy-MM-dd') : null;
  const seriesStart = series[0]?.date ?? null;
  const limitedFrom = windowStart && seriesStart && seriesStart > windowStart ? seriesStart : null;

  // Use last 90 days
  const chartData = series.slice(-90).map((d) => ({
    date: format(new Date(d.date), 'MMM dd'),
    value: +d.close.toFixed(2),
  }));

  const values = chartData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const currentValue = chartData[chartData.length - 1]?.value ?? 0;
  const firstValue = chartData[0]?.value ?? 0;
  const isPositive = currentValue >= firstValue;

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
        {chartData.length === 0 ? (
          <p className="flex h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
            No priced history for this period yet — the feed has not published closes for
            these holdings in this window.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickLine={false}
                interval="preserveStartEnd"
                className="fill-muted-foreground"
              />
              <YAxis
                /* Axis ticks stay abbreviated — they are a scale, not a stated value —
                   and an empty series must not reach recharts as ±Infinity. */
                tickFormatter={(v) => formatCompactNumber(v)}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={[minVal * 0.95, maxVal * 1.05]}
                className="fill-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
