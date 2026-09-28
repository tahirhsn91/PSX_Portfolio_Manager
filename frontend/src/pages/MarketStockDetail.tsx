/**
 * Stock detail page reachable from the Market section (not portfolio-specific).
 *
 * It is the same page as `StockDetail` — one component, so the two cannot drift into
 * near-identical copies of each other — read in its market context: the header links
 * back to Market, and the breadcrumbs name Market instead of a portfolio.
 */
import { StockDetail } from './StockDetail';

export function MarketStockDetail() {
  // The StockDetail component already handles a missing portfolioId gracefully;
  // stating the variant keeps the market reading explicit rather than inferred.
  return <StockDetail variant="market" />;
}
