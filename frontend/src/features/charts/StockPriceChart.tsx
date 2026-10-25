import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatVolume } from '@/utils';
import { useReducedMotion } from '@/hooks';
import type { HistoricalDataPoint, SupportResistanceLevel } from '@/types';
import { ChartSummary, type ChartSummaryItem } from './ChartSummary';
import { useChartTokens } from './useChartTokens';

interface StockPriceChartProps {
  data: HistoricalDataPoint[];
  symbol: string;
  supportLevels?: SupportResistanceLevel[];
  resistanceLevels?: SupportResistanceLevel[];
  purchasePrice?: number;
  /** True while the first history fetch is in flight — says so instead of drawing an empty plot. */
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const price = payload.find((p) => p.name === 'Close');
  const vol = payload.find((p) => p.name === 'Volume');
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1">
      <p className="font-medium">{label}</p>
      {price && <p className="font-semibold">{formatCurrency(price.value)}</p>}
      {vol && <p className="text-muted-foreground">Vol: {formatVolume(vol.value)}</p>}
    </div>
  );
};

export function StockPriceChart({ data, symbol, supportLevels = [], resistanceLevels = [], purchasePrice, isLoading = false }: StockPriceChartProps) {
  const reduced = useReducedMotion();
  // The series colours come from the tokens, not from this file: recharts writes
  // them into SVG attributes, where a `var()` would not resolve.
  const tokens = useChartTokens();

  const last90 = data.slice(-90);
  const chartData = last90
    .filter((d) => Number.isFinite(d.close))
    .map((d) => ({
      date: format(new Date(d.date), 'MMM dd'),
      Close: d.close,
      Volume: Number.isFinite(d.volume) ? d.volume : 0,
    }));

  const hasData = chartData.length > 0;
  const closes = chartData.map((d) => d.Close);
  // Computed only over a non-empty series. `Math.min(...[])` is `Infinity`, and
  // that used to reach recharts as the Y domain for a symbol with no history.
  const minClose = hasData ? Math.min(...closes) : 0;
  const maxClose = hasData ? Math.max(...closes) : 0;

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const changePercent = first && last && first.Close !== 0 ? (last.Close / first.Close - 1) * 100 : 0;

  const summaryItems: ChartSummaryItem[] = hasData
    ? [
        { label: `${first.date} → ${last.date}`, value: `${chartData.length} sessions` },
        { label: `Last close (${symbol})`, value: formatCurrency(last.Close) },
        {
          label: 'Change over window',
          value: `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
          tone: changePercent > 0 ? 'profit' : changePercent < 0 ? 'loss' : 'flat',
        },
        { label: 'High / low close', value: `${formatCurrency(maxClose)} / ${formatCurrency(minClose)}` },
        ...supportLevels.map((s) => ({ label: 'Support level', value: formatCurrency(s.price) })),
        ...resistanceLevels.map((r) => ({ label: 'Resistance level', value: formatCurrency(r.price) })),
        ...(purchasePrice !== undefined ? [{ label: 'Purchase price', value: formatCurrency(purchasePrice) }] : []),
      ]
    : [];

  // Why there is nothing to plot differs by cause, so name the cause.
  const emptyReason = data.length === 0
    ? `No price history for ${symbol} yet — the feed has not published any session for it.`
    : `No usable closes for ${symbol} in the returned history — the feed sent rows without a close price.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{symbol} — 90-day price (PKR)</CardTitle>
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
              role="group"
              aria-label={`${symbol} close price in PKR and volume over the last ${chartData.length} sessions, with support, resistance and purchase-price levels. The price axis is zoomed to this window, not zero-based.`}
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart accessibilityLayer data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: tokens.axis }} tickLine={false} interval="preserveStartEnd" className="fill-muted-foreground" />
                  <YAxis
                    yAxisId="price"
                    domain={[minClose * 0.97, maxClose * 1.03]}
                    tickFormatter={(v) => v.toFixed(0)}
                    tick={{ fontSize: 12, fill: tokens.axis }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    yAxisId="volume"
                    orientation="right"
                    tickFormatter={formatVolume}
                    tick={{ fontSize: 12, fill: tokens.axis }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                    width={54}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: tokens.axis, strokeOpacity: 0.5, strokeDasharray: '3 3' }}
                  />

                  {/* Support levels */}
                  {supportLevels.map((s) => (
                    <ReferenceLine key={`s-${s.price}`} y={s.price} yAxisId="price"
                      stroke={tokens.support} strokeDasharray="4 2" strokeWidth={1}
                      label={{ value: `S ${s.price}`, position: 'right', fontSize: 12, fill: tokens.support }}
                    />
                  ))}

                  {/* Resistance levels */}
                  {resistanceLevels.map((r) => (
                    <ReferenceLine key={`r-${r.price}`} y={r.price} yAxisId="price"
                      stroke={tokens.resistance} strokeDasharray="4 2" strokeWidth={1}
                      label={{ value: `R ${r.price}`, position: 'right', fontSize: 12, fill: tokens.resistance }}
                    />
                  ))}

                  {/* Purchase price */}
                  {purchasePrice !== undefined && (
                    <ReferenceLine y={purchasePrice} yAxisId="price"
                      stroke={tokens.buy} strokeDasharray="6 3" strokeWidth={1.5}
                      label={{ value: `Buy ${purchasePrice}`, position: 'left', fontSize: 12, fill: tokens.buy }}
                    />
                  )}

                  <Bar yAxisId="volume" dataKey="Volume" name="Volume" fill={tokens.volume} fillOpacity={0.2} radius={[2, 2, 0, 0]} isAnimationActive={!reduced} />
                  <Line yAxisId="price" type="monotone" dataKey="Close" name="Close" stroke={tokens.neutral} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={!reduced} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <ChartSummary
              caption={`${symbol} — last ${chartData.length} of ${data.length} sessions · close in PKR`}
              items={summaryItems}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The price axis is zoomed to this window, so the line's slope is not comparable to
              a zero-based chart; the summary above gives the actual levels.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
