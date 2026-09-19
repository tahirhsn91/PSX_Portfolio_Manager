import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, addDays } from 'date-fns';
import { marketDataService } from '@/services';
import { buildPortfolioValueSeries } from '@/utils';
import type { Holding, HistoricalDataPoint } from '@/types';

/** Default history window when the caller doesn't ask for one (~6 months). */
const DEFAULT_WINDOW_DAYS = 200;

/**
 * The portfolio's own value over time, for the "vs benchmark" comparison.
 *
 * Fetches each holding's price history (one request per distinct symbol, in
 * parallel) and prices the portfolio day by day via `buildPortfolioValueSeries`.
 * `windowDays` should cover the comparison period being plotted. The scraper
 * treats `to` as exclusive, so the window runs to tomorrow.
 */
export function usePortfolioHistory(
  holdings: Pick<Holding, 'symbol' | 'shares' | 'purchaseDate'>[] | undefined,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): { series: HistoricalDataPoint[]; isLoading: boolean } {
  const symbols = useMemo(
    () => [...new Set((holdings ?? []).map((h) => h.symbol.toUpperCase()))].sort(),
    [holdings],
  );

  const from = format(subDays(new Date(), windowDays), 'yyyy-MM-dd');
  const to = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  const query = useQuery({
    queryKey: ['portfolio-value-history', symbols.join('|'), from, to],
    enabled: symbols.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Record<string, HistoricalDataPoint[]>> => {
      const entries = await Promise.all(
        symbols.map(async (symbol) => {
          // One symbol without history must not sink the whole series.
          const points = await marketDataService
            .getHistoricalData(symbol, from, to)
            .catch(() => [] as HistoricalDataPoint[]);
          return [symbol, points] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  const series = useMemo(
    () => buildPortfolioValueSeries(holdings ?? [], query.data ?? {}),
    [holdings, query.data],
  );

  return { series, isLoading: query.isLoading };
}
