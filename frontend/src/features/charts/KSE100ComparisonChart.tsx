import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/utils';
import type { HistoricalDataPoint } from '@/types';

interface KSE100ComparisonChartProps {
  /** The portfolio's own value over time — build it with `buildPortfolioValueSeries`. */
  portfolioData: HistoricalDataPoint[];
  kse100Data: HistoricalDataPoint[];
  /**
   * Card heading. Pass the portfolio's name ("Demo vs KSE-100") where the chart
   * belongs to one portfolio; the default suits the all-portfolios dashboard.
   */
  title?: string;
  /** Name drawn on the portfolio line; defaults to "Portfolio". */
  portfolioLabel?: string;
  /** How many sessions to plot. */
  maxPoints?: number;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%` : '—'}
        </p>
      ))}
    </div>
  );
};

export interface ComparisonPoint {
  date: string;
  portfolio: number | null;
  kse100: number | null;
}

/**
 * Line the portfolio and the index up **by date**, each normalised to % return
 * from the first shared session.
 *
 * The previous version paired the two arrays positionally (the last 90 points of
 * each), which draws a confident-looking line even when the two series cover
 * different days — and it was handed the same index data for both series, so the
 * two lines sat exactly on top of each other and looked like one.
 *
 * Each series carries its last known value forward across gaps (the scraper's
 * history is patchy). Days a series can't cover at all stay `null`, so its line
 * simply begins later instead of pretending to start at zero.
 */
export function alignReturnsByDate(
  portfolioData: HistoricalDataPoint[],
  kse100Data: HistoricalDataPoint[],
  maxPoints = 90,
): { points: ComparisonPoint[]; portfolioReturnPercent: number; kse100ReturnPercent: number } {
  const sortedPortfolio = [...portfolioData].sort((a, b) => a.date.localeCompare(b.date));
  const sortedIndex = [...kse100Data].sort((a, b) => a.date.localeCompare(b.date));

  // Start where the portfolio does: before it was bought there is no portfolio.
  const startDate = sortedPortfolio[0]?.date ?? sortedIndex[0]?.date ?? '';
  const dates = [...new Set([...sortedPortfolio, ...sortedIndex].map((p) => p.date))]
    .filter((date) => date >= startDate)
    .sort()
    .slice(-maxPoints);

  if (dates.length === 0) {
    return { points: [], portfolioReturnPercent: 0, kse100ReturnPercent: 0 };
  }

  /** Walk a series in date order, yielding its last known close at or before `date`. */
  const cursor = (sorted: HistoricalDataPoint[]) => {
    let i = 0;
    let last: number | null = null;
    return (date: string): number | null => {
      while (i < sorted.length && sorted[i].date <= date) {
        const close = sorted[i].close;
        if (Number.isFinite(close) && close > 0) last = close;
        i += 1;
      }
      return last;
    };
  };

  const portfolioAt = cursor(sortedPortfolio);
  const indexAt = cursor(sortedIndex);
  const portfolioBase = portfolioAt(dates[0]);
  const indexBase = indexAt(dates[0]);

  const points: ComparisonPoint[] = dates.map((date, position) => {
    const portfolioValue = position === 0 ? portfolioBase : portfolioAt(date);
    const indexValue = position === 0 ? indexBase : indexAt(date);
    return {
      date: format(new Date(`${date}T00:00:00`), 'MMM dd'),
      portfolio: portfolioValue !== null && portfolioBase
        ? +((portfolioValue / portfolioBase - 1) * 100).toFixed(2)
        : null,
      kse100: indexValue !== null && indexBase
        ? +((indexValue / indexBase - 1) * 100).toFixed(2)
        : null,
    };
  });

  const last = points[points.length - 1];
  return {
    points,
    portfolioReturnPercent: last?.portfolio ?? 0,
    kse100ReturnPercent: last?.kse100 ?? 0,
  };
}

export function KSE100ComparisonChart({
  portfolioData, kse100Data,
  title = 'vs KSE-100',
  portfolioLabel = 'Portfolio',
  maxPoints = 90,
}: KSE100ComparisonChartProps) {
  const { points, portfolioReturnPercent, kse100ReturnPercent } = alignReturnsByDate(
    portfolioData, kse100Data, maxPoints,
  );

  const hasPortfolioLine = points.some((p) => p.portfolio !== null);
  const hasIndexLine = points.some((p) => p.kse100 !== null);
  const hasData = hasPortfolioLine && hasIndexLine;
  const outperformance = portfolioReturnPercent - kse100ReturnPercent;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              {hasData
                ? `Return since ${points[0]?.date} — both lines normalised to 0% there`
                : 'Normalised return comparison'}
            </CardDescription>
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
              <p className="truncate text-xs text-muted-foreground" title={`${portfolioLabel} Return`}>
                {portfolioLabel} Return
              </p>
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
            <LineChart data={points} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" className="fill-muted-foreground" />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="portfolio" name={portfolioLabel} stroke="#00a651" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="kse100" name="KSE-100" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {hasPortfolioLine
              ? 'KSE-100 data is unavailable right now, so there is nothing to compare against yet. The comparison fills in as soon as the index feed reports.'
              : 'No portfolio history to plot yet — add a holding with a purchase date and the portfolio line appears as soon as its prices are in.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
