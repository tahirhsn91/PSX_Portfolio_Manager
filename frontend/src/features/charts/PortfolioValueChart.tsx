import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils';
import type { HistoricalDataPoint } from '@/types';

interface PortfolioValueChartProps {
  historicalData: HistoricalDataPoint[];
  totalShares: number;
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-medium">{label}</p>
      <p className="text-primary font-semibold">{formatCurrency(payload[0].value, true)}</p>
    </div>
  );
};

export function PortfolioValueChart({ historicalData, totalShares, title = 'Portfolio Value' }: PortfolioValueChartProps) {
  // Use last 90 days
  const chartData = historicalData.slice(-90).map((d) => ({
    date: format(new Date(d.date), 'MMM dd'),
    value: +(d.close * totalShares).toFixed(0),
  }));

  const minVal = Math.min(...chartData.map((d) => d.value));
  const maxVal = Math.max(...chartData.map((d) => d.value));
  const currentValue = chartData[chartData.length - 1]?.value ?? 0;
  const firstValue = chartData[0]?.value ?? 0;
  const isPositive = currentValue >= firstValue;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
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
              tickFormatter={(v) => formatCurrency(v, true).replace('PKR ', '')}
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
      </CardContent>
    </Card>
  );
}
