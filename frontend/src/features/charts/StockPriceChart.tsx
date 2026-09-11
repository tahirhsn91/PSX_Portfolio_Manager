import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatVolume } from '@/utils';
import type { HistoricalDataPoint, SupportResistanceLevel } from '@/types';

interface StockPriceChartProps {
  data: HistoricalDataPoint[];
  symbol: string;
  supportLevels?: SupportResistanceLevel[];
  resistanceLevels?: SupportResistanceLevel[];
  purchasePrice?: number;
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

export function StockPriceChart({ data, symbol, supportLevels = [], resistanceLevels = [], purchasePrice }: StockPriceChartProps) {
  const last90 = data.slice(-90);
  const chartData = last90.map((d) => ({
    date: format(new Date(d.date), 'MMM dd'),
    Close: d.close,
    Volume: d.volume,
  }));

  const closes = last90.map((d) => d.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{symbol} — 90 Day Price</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" className="fill-muted-foreground" />
            <YAxis
              yAxisId="price"
              domain={[minClose * 0.97, maxClose * 1.03]}
              tickFormatter={(v) => v.toFixed(0)}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              tickFormatter={formatVolume}
              tick={{ fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Support levels */}
            {supportLevels.map((s) => (
              <ReferenceLine key={`s-${s.price}`} y={s.price} yAxisId="price"
                stroke="#22c55e" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: `S ${s.price}`, position: 'right', fontSize: 9, fill: '#22c55e' }}
              />
            ))}

            {/* Resistance levels */}
            {resistanceLevels.map((r) => (
              <ReferenceLine key={`r-${r.price}`} y={r.price} yAxisId="price"
                stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: `R ${r.price}`, position: 'right', fontSize: 9, fill: '#ef4444' }}
              />
            ))}

            {/* Purchase price */}
            {purchasePrice && (
              <ReferenceLine y={purchasePrice} yAxisId="price"
                stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: `Buy ${purchasePrice}`, position: 'left', fontSize: 9, fill: '#f59e0b' }}
              />
            )}

            <Bar yAxisId="volume" dataKey="Volume" name="Volume" fill="#3b82f6" fillOpacity={0.2} radius={[2, 2, 0, 0]} />
            <Line yAxisId="price" type="monotone" dataKey="Close" name="Close" stroke="#00a651" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
