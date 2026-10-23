import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatPkr, formatPrice } from '@/utils/formatters';
import { sharesForBudget } from '@/utils/averageDown';
import { AnimatedNumber } from '@/components/animations';

const PRESETS = [1000, 5000, 10000, 25000] as const;

interface BudgetCalculatorProps {
  symbol: string;
  marketPrice: number;
  /** Charges as a percentage, already resolved from the page's fees toggle. */
  feePercent: number;
}

/**
 * "I have PKR X — how many shares is that?" The inverse of the target planner,
 * so it stays on the same page and reads the same holding and price.
 */
export function BudgetCalculator({ symbol, marketPrice, feePercent }: BudgetCalculatorProps) {
  const [amount, setAmount] = useState('1000');
  const budget = amount.trim() === '' ? 0 : Number(amount);
  const purchase = sharesForBudget({ budget, marketPrice, feePercent });
  const usedPercent =
    purchase.ok && budget > 0 ? Math.min(100, (purchase.totalCost / budget) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Budget calculator</CardTitle>
        <CardDescription>
          How many whole shares your money buys{symbol ? ` in ${symbol}` : ''} — and what is left.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="budget-amount">Amount to invest</Label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground"
              >
                PKR
              </span>
              <Input
                id="budget-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 pl-12 font-mono text-base tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                placeholder="1000"
              />
            </div>
          </div>

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quick amounts">
          {PRESETS.map((preset) => {
            const active = budget === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => setAmount(String(preset))}
                className={cn(
                  'h-11 rounded-full border px-4 text-xs font-medium tabular-nums transition-colors duration-fast ease-standard',
                  'motion-safe:active:scale-[0.97]',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                PKR {preset.toLocaleString('en-PK')}
              </button>
            );
          })}
        </div>
        </div>

        {!purchase.ok ? (
          <p className="rounded-xl border border-dashed bg-surface/50 p-4 text-sm text-muted-foreground">
            {purchase.message}
          </p>
        ) : (
          <div aria-live="polite" className="rounded-xl border bg-surface/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Shares you get
                </p>
                <p
                  data-testid="budget-shares"
                  className="mt-1 font-mono text-4xl font-semibold leading-none tabular-nums text-foreground"
                >
                  <AnimatedNumber
                    value={purchase.shares}
                    format={(v) => Math.round(v).toLocaleString('en-PK')}
                    duration={0.45}
                  />
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {symbol} · {formatPrice(marketPrice)} each
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Left over
                </p>
                <p
                  data-testid="budget-left"
                  className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground"
                >
                  {formatPkr(purchase.remaining)}
                </p>
              </div>
            </div>

            <Progress
              value={usedPercent}
              aria-label={`${Math.round(usedPercent)}% of the amount is used`}
              className="mt-4 h-1.5"
            />

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Cost of shares</dt>
                <dd className="font-mono tabular-nums">{formatPkr(purchase.grossCost)}</dd>
              </div>
              {purchase.fees > 0 && (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Charges</dt>
                  <dd
                    data-testid="budget-fees"
                    className="font-mono tabular-nums"
                  >
                    {formatPkr(purchase.fees)}
                  </dd>
                </div>
              )}
              {purchase.fees > 0 && (
                <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
                  <dt className="font-medium">Total spent</dt>
                  <dd className="font-mono font-semibold tabular-nums">
                    {formatPkr(purchase.totalCost)}
                  </dd>
                </div>
              )}
            </dl>

            {purchase.shortfall !== null && (
              <div className="mt-3 flex gap-2 rounded-lg border border-warning/30 bg-warning-light p-3 text-xs text-warning-dark">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  One share costs {formatPrice(purchase.effectivePrice)} — add{' '}
                  <strong>{formatPkr(purchase.shortfall)}</strong> to buy a whole share.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
