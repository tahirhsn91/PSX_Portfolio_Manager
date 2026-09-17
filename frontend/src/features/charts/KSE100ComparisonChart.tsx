import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/utils';
import type { HistoricalDataPoint } from '@/types';

interface KSE100ComparisonChartProps {
  portfolioData: HistoricalDataPoint[];
  kse100Data: HistoricalDataPoint[];
  portfolioReturnPercent: number;
  kse100ReturnPercent: number;
  /**
   * Card heading. Pass the portfolio's name ("Demo vs KSE-100") where the chart
   * belongs to one portfolio; the default suits the all-portfolios dashboard.
   */
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
        </p>
      ))}
    </div>
  );
};

export function KSE100ComparisonChart({
  portfolioData, kse100Data, portfolioReturnPercent, kse100ReturnPercent,
  title = 'vs KSE-100',
}: KSE100ComparisonChartProps) {
  // Normalize both to % return from start
  const portfolioBase = portfolioData[0]?.close ?? 1;
  const kse100Base = kse100Data[0]?.close ?? 1;
  const days = Math.min(portfolioData.length, kse100Data.length, 90);

  const chartData = Array.from({ length: days }, (_, i) => {
    const pi = portfolioData.length - days + i;
    const ki = kse100Data.length - days + i;
    const pd = portfolioData[pi];
    const kd = kse100Data[ki];
    return {
      date: pd ? format(new Date(pd.date), 'MMM dd') : '',
      portfolio: pd ? +((pd.close / portfolioBase - 1) * 100).toFixed(2) : 0,
      kse100: kd ? +((kd.close / kse100Base - 1) * 100).toFixed(2) : 0,
    };
  });

  const outperformance = portfolioReturnPercent - kse100ReturnPercent;

  // The card always renders — the section has to be able to name the portfolio
  // even when the index feed is down, and the heading is the point of the section.
  const hasData = portfolioData.length > 0 && kse100Data.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>90-day normalized return comparison</CardDescription>
          </div>
          {hasData && (
            <Badge variant={outperformance >= 0 ? 'profit' : 'loss'}>
              {outperformance >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(outperformance))} vs index
            </Badge>
          )}
        </div>
        {hasData && (
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="rounded-md bg-muted/40 p-2 text-center">
              <p className="text-xs text-muted-foreground">Portfolio Return</p>
              <p className={`font-bold ${portfolioReturnPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatPercent(portfolioReturnPercent)}
              </p>
            </div>
            <div className="rounded-md bg-muted/40 p-2 text-center">
              <p className="text-xs text-muted-foreground">KSE-100 Return</p>
              <p className={`font-bold ${kse100ReturnPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatPercent(kse100ReturnPercent)}
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" className="fill-muted-foreground" />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#00a651" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="kse100" name="KSE-100" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            KSE-100 data is unavailable right now, so there is nothing to compare against yet.
            The comparison fills in as soon as the index feed reports.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
