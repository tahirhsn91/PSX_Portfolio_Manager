/**
 * Stock detail page accessible from the Market section (not portfolio-specific).
 * Reuses StockDetail but without portfolio context.
 */
import { StockDetail } from './StockDetail';

export function MarketStockDetail() {
  // The StockDetail component already handles missing portfolioId gracefully
  return <StockDetail />;
}
