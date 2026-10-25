import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatPkr, formatPrice } from '@/utils/formatters';
import { averageAfterBuy, costForShares } from '@/utils/averageDown';
import { AnimatedNumber } from '@/components/animations';

const PRESETS = [50, 100, 200, 300] as const;

interface ShareQuantityCalculatorProps {
  symbol: string;
  marketPrice: number;
  /** Charges as a percentage, already resolved from the page's fees toggle. */
  feePercent: number;
  heldShares: number;
  heldAverage: number;
}

/**
 * "I want 300 shares — what will it cost?" The third way into the same trade:
 * a quantity instead of a target average or a budget.
 */
export function ShareQuantityCalculator({
  symbol,
  marketPrice,
  feePercent,
  heldShares,
  heldAverage,
}: ShareQuantityCalculatorProps) {
  const [quantity, setQuantity] = useState('300');
  const shares = quantity.trim() === '' ? 0 : Number(quantity);
  const cost = costForShares({ shares, marketPrice, feePercent });
  const averageAfter =
    cost.ok && heldShares > 0
      ? averageAfterBuy(heldShares, heldAverage, marketPrice, cost.shares, feePercent)
      : null;
  const totalShares = cost.ok ? heldShares + cost.shares : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Share quantity</CardTitle>
        <CardDescription>
          Price a purchase by the number of shares{symbol ? ` in ${symbol}` : ''} — charges included.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="share-qty">Shares to buy</Label>
            <Input
              id="share-qty"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="300"
              className="h-11 font-mono text-base tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quick quantities">
            {PRESETS.map((preset) => {
              const active = shares === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setQuantity(String(preset))}
                  className={cn(
                    'h-11 rounded-full border px-4 text-xs font-medium tabular-nums transition-colors duration-fast ease-standard',
                    'motion-safe:active:scale-[0.97]',
                    active
                      ? 'border-primary/40 bg-primary-soft text-primary-soft-foreground'
                      : 'bg-background text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {preset.toLocaleString('en-PK')} shares
                </button>
              );
            })}
          </div>
        </div>

        {!cost.ok ? (
          <p className="rounded-xl border border-dashed bg-surface/50 p-4 text-sm text-muted-foreground">
            {cost.message}
          </p>
        ) : (
          <div aria-live="polite" className="rounded-xl border bg-surface/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Total cost
                </p>
                <p
                  data-testid="share-cost-total"
                  className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums text-foreground sm:text-4xl"
                >
                  <AnimatedNumber
                    value={cost.totalCost}
                    format={(v) => formatPkr(v)}
                    duration={0.45}
                  />
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {cost.shares.toLocaleString('en-PK')} × {formatPrice(marketPrice)}
                  {cost.fees > 0 ? ' + charges' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Shares
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                  {cost.shares.toLocaleString('en-PK')}
                </p>
              </div>
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Cost of shares</dt>
                <dd className="font-mono tabular-nums">{formatPkr(cost.grossCost)}</dd>
              </div>
              {cost.fees > 0 && (
                <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
                  <dt className="font-medium">Charges</dt>
                  <dd data-testid="share-cost-fees" className="font-mono tabular-nums">
                    {formatPkr(cost.fees)}
                  </dd>
                </div>
              )}
            </dl>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Average after buy
                </dt>
                <dd
                  data-testid="share-cost-avg"
                  className="font-mono text-sm font-semibold tabular-nums"
                >
                  {averageAfter === null ? '—' : formatPrice(averageAfter)}
                </dd>
                <p className="text-[11px] text-muted-foreground">
                  now {formatPrice(heldAverage)}
                </p>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total shares
                </dt>
                <dd className="font-mono text-sm font-semibold tabular-nums">
                  {totalShares === null ? '—' : totalShares.toLocaleString('en-PK')}
                </dd>
                <p className="text-[11px] text-muted-foreground">
                  now {heldShares.toLocaleString('en-PK')}
                </p>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
