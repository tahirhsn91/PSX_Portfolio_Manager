import { useQuery } from '@tanstack/react-query';
import { predictionEngine } from '@/services';
import { marketDataService } from '@/services';
import { format, subYears } from 'date-fns';
import type { DividendRecord } from '@/types';

export function useStockPrediction(
  symbol: string | undefined,
  currentPrice: number | undefined,
  dividendHistory: DividendRecord[] = []
) {
  return useQuery({
    queryKey: ['prediction', symbol],
    queryFn: async () => {
      const to = format(new Date(), 'yyyy-MM-dd');
      const from = format(subYears(new Date(), 1), 'yyyy-MM-dd');
      const historicalData = await marketDataService.getHistoricalData(symbol!, from, to);
      return predictionEngine.predict(symbol!, historicalData, currentPrice!, dividendHistory);
    },
    enabled: !!symbol && !!currentPrice,
    staleTime: 3_600_000, // predictions are expensive; cache 1 hour
    retry: 1,
  });
}
