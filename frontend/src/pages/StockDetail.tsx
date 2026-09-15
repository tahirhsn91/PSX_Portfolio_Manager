import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard, RangeBar } from '@/components/shared';
import { StockPriceChart } from '@/features/charts';
import { PredictionPanel } from '@/features/prediction/PredictionPanel';
import { useStockDetail, useHistoricalData, useStockPrediction } from '@/hooks';
import { usePortfolioStore } from '@/store';
import { formatCurrency, formatPercent, formatDate, formatVolume, formatCompactNumber } from '@/utils';
import { ROUTES } from '@/constants';
import { format, subYears } from 'date-fns';
import { cn } from '@/lib/utils';

export function StockDetail() {
  const { portfolioId = '', symbol = '' } = useParams<{ portfolioId: string; symbol: string }>();
  const navigate = useNavigate();

  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === portfolioId));
  const holding = portfolio?.holdings.find((h) => h.symbol === symbol);

  const { data: detail, isLoading: detailLoading } = useStockDetail(symbol);
  const { data: historicalData = [], isLoading: histLoading } = useHistoricalData(
    symbol,
    format(subYears(new Date(), 1), 'yyyy-MM-dd'),
    format(new Date(), 'yyyy-MM-dd')
  );
  const { data: prediction, isLoading: predLoading } = useStockPrediction(
    symbol,
    detail?.currentPrice,
    holding?.dividendsReceived ?? []
  );

  const isProfit = (detail?.changePercent ?? 0) >= 0;

  const goBack = () => navigate(portfolioId ? ROUTES.PORTFOLIO_DETAIL_PATH(portfolioId) : ROUTES.MARKET);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono">{symbol}</span>
              {detailLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <Badge variant={isProfit ? 'profit' : 'loss'} className="gap-1">
                  {isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {formatPercent(detail?.changePercent ?? 0)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{detail?.companyName ?? symbol}</p>
          </div>
        </div>
        {detailLoading ? (
          <Skeleton className="h-9 w-28 ml-auto" />
        ) : (
          <div className="ml-auto text-right">
            <p className="text-3xl font-bold">{formatCurrency(detail?.currentPrice ?? 0)}</p>
            <p className={cn('text-sm font-medium', isProfit ? 'text-profit' : 'text-loss')}>
              {isProfit ? '+' : ''}{formatCurrency(detail?.change ?? 0)} today
            </p>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <RangeBar
          className="col-span-2"
          low={detail?.week52Low ?? 0}
          high={detail?.week52High ?? 0}
          current={detail?.currentPrice ?? 0}
          isLoading={detailLoading}
        />
        <MetricCard title="Div. Yield" value={detail?.dividendYield ?? 0} isPercent isLoading={detailLoading} />
        <MetricCard title="Volume" value={detail ? formatVolume(detail.volume) : '—'} isLoading={detailLoading} />
      </div>

      {/* Holding info */}
      {holding && (
        <Card>
          <CardHeader><CardTitle className="text-base">Your Position</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground">Shares</p><p className="font-semibold">{holding.shares.toLocaleString()}</p></div>
            <div><p className="text-muted-foreground">Avg Cost</p><p className="font-semibold">{formatCurrency(holding.averagePurchasePrice)}</p></div>
            <div><p className="text-muted-foreground">Cost Basis</p><p className="font-semibold">{formatCurrency(holding.shares * holding.averagePurchasePrice, true)}</p></div>
            <div><p className="text-muted-foreground">Held Since</p><p className="font-semibold">{formatDate(holding.purchaseDate)}</p></div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Price Chart</TabsTrigger>
          <TabsTrigger value="fundamentals">Fundamentals</TabsTrigger>
          <TabsTrigger value="prediction">Prediction</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="mt-4">
          {histLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : (
            <StockPriceChart
              data={historicalData}
              symbol={symbol}
              supportLevels={prediction?.supportLevels}
              resistanceLevels={prediction?.resistanceLevels}
              purchasePrice={holding?.averagePurchasePrice}
            />
          )}
        </TabsContent>

        <TabsContent value="fundamentals" className="mt-4">
          {detailLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : detail ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Market Data</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    ['Open', formatCurrency(detail.open)],
                    ['Previous Close', formatCurrency(detail.previousClose)],
                    ['Day High', formatCurrency(detail.high)],
                    ['Day Low', formatCurrency(detail.low)],
                    ['52W High', formatCurrency(detail.week52High)],
                    ['52W Low', formatCurrency(detail.week52Low)],
                    ['Avg Volume', formatVolume(detail.averageVolume)],
                    ['Market Cap', formatCompactNumber(detail.marketCap) + ' PKR'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium font-mono">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Valuation</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    ['P/E Ratio', detail.peRatio?.toFixed(2) ?? '—'],
                    ['EPS', detail.eps ? formatCurrency(detail.eps) : '—'],
                    ['Book Value', detail.bookValue ? formatCurrency(detail.bookValue) : '—'],
                    ['Dividend Yield', detail.dividendYield ? `${detail.dividendYield.toFixed(2)}%` : '—'],
                    ['Next Dividend', detail.nextDividendAmount ? formatCurrency(detail.nextDividendAmount) + '/share' : '—'],
                    ['Next Div. Date', formatDate(detail.nextDividendDate)],
                    ['Beta', detail.beta?.toFixed(2) ?? '—'],
                    ['Sector', detail.sector],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              {detail.description && (
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">About</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground">{detail.description}</p></CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="prediction" className="mt-4">
          <div className="max-w-2xl">
            <PredictionPanel prediction={prediction} isLoading={predLoading} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
