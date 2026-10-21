import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { averageCurve, type AverageDownInput } from '@/utils/averageDown';
import { formatPrice } from '@/utils/formatters';
import { useChartTokens } from '@/features/charts/useChartTokens';

interface AveragePriceChartProps {
  input: AverageDownInput;
  target: number;
  /** Right edge of the curve; the page passes 2× the required shares. */
  maxShares: number;
}

/** Average price against shares bought, with the target as a reference line. */
export function AveragePriceChart({ input, target, maxShares }: AveragePriceChartProps) {
  const tokens = useChartTokens();
  const points = useMemo(() => averageCurve(input, maxShares, 40), [input, maxShares]);

  if (points.length === 0) return null;

  const averages = points.map((p) => p.average);
  const low = Math.min(...averages, target);
  const high = Math.max(...averages, target);
  const pad = Math.max((high - low) * 0.08, 0.05);

  return (
    <div
      role="img"
      aria-label={`Average price falls from ${formatPrice(input.averagePrice)} toward ${formatPrice(
        input.marketPrice,
      )} as shares bought increase to ${maxShares.toLocaleString('en-PK')}.`}
      className="h-56 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={tokens.axis} strokeOpacity={0.12} vertical={false} />
          <XAxis
            dataKey="shares"
            tick={{ fill: tokens.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => value.toLocaleString('en-PK')}
            minTickGap={24}
            height={26}
          />
          <YAxis
            domain={[low - pad, high + pad]}
            tick={{ fill: tokens.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => value.toFixed(0)}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(var(--overlay))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(value) => `${Number(value).toLocaleString('en-PK')} shares`}
            formatter={(value) => [formatPrice(Number(value)), 'Average']}
          />
          <ReferenceLine
            y={target}
            stroke={tokens.support}
            strokeDasharray="4 4"
            label={{
              value: `Target ${target.toLocaleString('en-PK')}`,
              position: 'insideTopLeft',
              fill: tokens.axis,
              fontSize: 11,
            }}
          />
          <Line
            type="monotone"
            dataKey="average"
            stroke={tokens.up}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
