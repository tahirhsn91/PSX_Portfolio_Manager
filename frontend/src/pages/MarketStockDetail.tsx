/**
 * Stock detail page accessible from the Market section (not portfolio-specific).
 * Reuses StockDetail but without portfolio context.
 */
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StockDetail } from './StockDetail';
import { ROUTES } from '@/constants';

export function MarketStockDetail() {
  // The StockDetail component already handles missing portfolioId gracefully
  return <StockDetail />;
}
