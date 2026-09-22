import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/utils';
import { CHART_COLORS } from '@/constants';

interface AllocationData {
  name: string;
  value: number;
  percent: number;
  color?: string;
}

interface AllocationPieChartProps {
  data: AllocationData[];
  title?: string;
  valueLabel?: string;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: AllocationData }[] }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-semibold">{item.name}</p>
      <p className="text-muted-foreground">{formatCurrency(item.value, true)}</p>
      <p className="text-muted-foreground">{formatPercent(item.percent, false)} of portfolio</p>
    </div>
  );
};

const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number }) => {
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
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {`${percentValue.toFixed(0)}%`}
    </text>
  );
};

export function AllocationPieChart({ data, title = 'Portfolio Allocation' }: AllocationPieChartProps) {
  const chartData = data.map((d, i) => ({ ...d, color: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Height is 320 not 280: the legend for a 7-sector portfolio wraps to ~3 rows
            (~96px), and that space is taken off the plot area *before* the pie is laid
            out, so the circle had 184px of height to live in. */}
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={CustomLabel as unknown as boolean}
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
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
