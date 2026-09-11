import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SectorData {
  sector: string;
  changePercent: number;
}

interface SectorBarChartProps {
  data: SectorData[];
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-medium">{label}</p>
      <p className={val >= 0 ? 'text-profit' : 'text-loss'}>
        {val >= 0 ? '+' : ''}{val.toFixed(2)}%
      </p>
    </div>
  );
};

export function SectorBarChart({ data, title = 'Sector Performance' }: SectorBarChartProps) {
  const sorted = [...data].sort((a, b) => b.changePercent - a.changePercent);
  const abbreviated = sorted.map((d) => ({
    ...d,
    sector: d.sector.length > 12 ? d.sector.split(' ').map((w) => w[0]).join('') : d.sector,
    fullSector: d.sector,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={abbreviated} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="sector"
              tick={{ fontSize: 9 }}
              tickLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={60}
              className="fill-muted-foreground"
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="changePercent" radius={[4, 4, 0, 0]}>
              {abbreviated.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.changePercent >= 0 ? '#22c55e' : '#ef4444'}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
