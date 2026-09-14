import { Brain, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDate } from '@/utils';
import type { StockPrediction } from '@/types';
import { cn } from '@/lib/utils';

interface PredictionPanelProps {
  prediction: StockPrediction | undefined;
  isLoading: boolean;
}

const TREND_CONFIG = {
  bullish: { label: 'Bullish', color: 'text-profit', icon: TrendingUp, badgeClass: 'bg-profit-light text-profit-dark' },
  bearish: { label: 'Bearish', color: 'text-loss', icon: TrendingDown, badgeClass: 'bg-loss-light text-loss-dark' },
  neutral: { label: 'Neutral', color: 'text-muted-foreground', icon: Minus, badgeClass: '' },
  sideways: { label: 'Sideways', color: 'text-amber-500', icon: Minus, badgeClass: 'bg-amber-50 text-amber-700' },
};

export function PredictionPanel({ prediction, isLoading }: PredictionPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary animate-pulse" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (!prediction) return null;

  const trendCfg = TREND_CONFIG[prediction.trendDirection];
  const TrendIcon = trendCfg.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Prediction Engine</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">Rule-based</Badge>
        </div>
        <CardDescription>{prediction.summary}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Trend & Confidence */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground mb-1">Trend</p>
            <div className={cn('flex items-center gap-1.5 font-semibold', trendCfg.color)}>
              <TrendIcon className="h-4 w-4" />
              {trendCfg.label}
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground mb-1">Confidence</p>
            <div className="flex items-center gap-2">
              <Progress value={prediction.confidenceScore} className="h-2 flex-1" />
              <span className="text-xs font-semibold tabular-nums">{prediction.confidenceScore}%</span>
            </div>
            <p className={cn('text-xs mt-1 font-medium capitalize', {
              'text-profit': prediction.confidenceLevel === 'high',
              'text-amber-500': prediction.confidenceLevel === 'medium',
              'text-loss': prediction.confidenceLevel === 'low',
            })}>
              {prediction.confidenceLevel} confidence
            </p>
          </div>
        </div>

        <Separator />

        {/* Price Targets */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Price Targets</p>
          </div>
          <div className="space-y-2">
            {prediction.priceTargets.map((target) => (
              <div key={target.timeframe} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground w-8">{target.timeframe}</span>
                <span className="font-mono font-medium">{formatCurrency(target.targetPrice)}</span>
                <span className={cn('font-medium', target.upside >= 0 ? 'text-profit' : 'text-loss')}>
                  {target.upside >= 0 ? '+' : ''}{target.upside.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">{target.probability}% prob</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Support & Resistance */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-profit mb-2">Support Levels</p>
            {prediction.supportLevels.length === 0 ? (
              <p className="text-xs text-muted-foreground">None found</p>
            ) : (
              <div className="space-y-1">
                {prediction.supportLevels.map((s) => (
                  <div key={s.price} className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium">{formatCurrency(s.price)}</span>
                    <span className={cn('capitalize', {
                      'text-profit font-semibold': s.strength === 'strong',
                      'text-amber-500': s.strength === 'moderate',
                      'text-muted-foreground': s.strength === 'weak',
                    })}>
                      {s.strength}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-loss mb-2">Resistance Levels</p>
            {prediction.resistanceLevels.length === 0 ? (
              <p className="text-xs text-muted-foreground">None found</p>
            ) : (
              <div className="space-y-1">
                {prediction.resistanceLevels.map((r) => (
                  <div key={r.price} className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium">{formatCurrency(r.price)}</span>
                    <span className={cn('capitalize', {
                      'text-loss font-semibold': r.strength === 'strong',
                      'text-amber-500': r.strength === 'moderate',
                      'text-muted-foreground': r.strength === 'weak',
                    })}>
                      {r.strength}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Dividend Prediction */}
        {prediction.dividendPrediction.expectedAmountPerShare && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Dividend Prediction</p>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected Amount</span>
                <span className="font-medium">{formatCurrency(prediction.dividendPrediction.expectedAmountPerShare)} / share</span>
              </div>
              {prediction.dividendPrediction.expectedDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected Date</span>
                  <span className="font-medium">{formatDate(prediction.dividendPrediction.expectedDate)}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground pt-1">{prediction.dividendPrediction.basedOn}</p>
            </div>
          </div>
        )}

        {/* Signals */}
        {prediction.signals.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-semibold mb-2">Technical Signals</p>
              <div className="space-y-1.5">
                {prediction.signals.map((signal) => (
                  <div key={signal.name} className="flex items-start gap-2 text-xs">
                    <span className={cn('mt-0.5 h-2 w-2 rounded-full shrink-0', {
                      'bg-profit': signal.type === 'bullish',
                      'bg-loss': signal.type === 'bearish',
                      'bg-muted-foreground': signal.type === 'neutral',
                    })} />
                    <div>
                      <span className="font-semibold">{signal.name}</span>
                      <span className="text-muted-foreground ml-1">— {signal.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Risks */}
        {prediction.risks.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold">Risk Factors</p>
              </div>
              <ul className="space-y-1">
                {prediction.risks.map((risk) => (
                  <li key={risk} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-amber-500">•</span>{risk}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
