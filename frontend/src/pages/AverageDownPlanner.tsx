import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calculator, Info, TriangleAlert, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStockQuote } from '@/hooks/useMarketData';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUIStore } from '@/store/uiStore';
import { ROUTES } from '@/constants/routes';
import { formatPkr, formatPrice } from '@/utils/formatters';
import {
  planAverage,
  whatIfScenarios,
  type AverageDirection,
  type AverageDownSuccess,
} from '@/utils/averageDown';
import { AveragePriceChart } from '@/features/planner/AveragePriceChart';
import { BudgetCalculator } from '@/features/planner/BudgetCalculator';
import type { Holding } from '@/types/portfolio.types';

interface HoldingOption {
  key: string;
  portfolioId: string;
  portfolioName: string;
  holding: Holding;
}

const keyOf = (portfolioId: string, holdingId: string) => `${portfolioId}:${holdingId}`;

/** Number fields without the browser's stepper arrows — they crowd a money input. */
const NUMBER_FIELD =
  'font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-surface/60 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">{value}</dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface TradeContextProps {
  idPrefix: string;
  options: HoldingOption[];
  selectedKey: string;
  onHoldingChange: (key: string) => void;
  holding?: Holding;
  priceText: string;
  onPriceChange: (value: string) => void;
  onUseLive: () => void;
  priceOverridden: boolean;
  livePrice: number | null;
  quoteLoading: boolean;
  feeOn: boolean;
  onFeeChange: (value: boolean) => void;
  feeInput: string;
  onFeeInputChange: (value: string) => void;
}

/** The stock, its price and the charges — shared by both calculators. */
function TradeContext({
  idPrefix,
  options,
  selectedKey,
  onHoldingChange,
  holding,
  priceText,
  onPriceChange,
  onUseLive,
  priceOverridden,
  livePrice,
  quoteLoading,
  feeOn,
  onFeeChange,
  feeInput,
  onFeeInputChange,
}: TradeContextProps) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-holding`}>Holding</Label>
        <Select value={selectedKey} onValueChange={onHoldingChange}>
          <SelectTrigger id={`${idPrefix}-holding`}>
            <SelectValue placeholder="Choose a holding" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.holding.symbol} — {option.portfolioName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Shares</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {holding?.shares.toLocaleString('en-PK') ?? '—'}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg price</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {holding ? formatPrice(holding.averagePurchasePrice) : '—'}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-price`}>Market price</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-price`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={priceText}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder="0.00"
            className={NUMBER_FIELD}
          />
          <Button
            type="button"
            variant="outline"
            onClick={onUseLive}
            disabled={!priceOverridden || livePrice === null}
            title="Use the live quote"
          >
            Live
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {quoteLoading
            ? 'Fetching the latest quote…'
            : livePrice === null
              ? 'No live quote — enter the price you would pay.'
              : 'Auto-filled from the live PSX quote; edit it to model a different fill.'}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label htmlFor={`${idPrefix}-fees`} className="text-sm">
            Include charges
          </Label>
          <p className="text-[11px] text-muted-foreground">Brokerage, CVT and other fees</p>
        </div>
        <Switch id={`${idPrefix}-fees`} checked={feeOn} onCheckedChange={onFeeChange} />
      </div>
      {feeOn && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-fee-percent`}>Charges (%)</Label>
          <Input
            id={`${idPrefix}-fee-percent`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="10"
            value={feeInput}
            onChange={(e) => onFeeInputChange(e.target.value)}
            className={NUMBER_FIELD}
          />
        </div>
      )}
    </>
  );
}

export function AverageDownPlanner() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const buyInto = usePortfolioStore((s) => s.buyInto);
  const addNotification = useUIStore((s) => s.addNotification);

  const options = useMemo<HoldingOption[]>(
    () =>
      portfolios.flatMap((portfolio) =>
        portfolio.holdings.map((holding) => ({
          key: keyOf(portfolio.id, holding.id),
          portfolioId: portfolio.id,
          portfolioName: portfolio.name,
          holding,
        })),
      ),
    [portfolios],
  );

  const [selectedKey, setSelectedKey] = useState('');
  const [direction, setDirection] = useState<AverageDirection>('down');
  const [targetInput, setTargetInput] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [priceInput, setPriceInput] = useState<string | null>(null);
  const [feeOn, setFeeOn] = useState(false);
  const [feeInput, setFeeInput] = useState('0.15');
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [tab, setTab] = useState<'average' | 'spend'>('average');

  // Default the holding from the link that brought the user here, then the
  // first holding they own.
  useEffect(() => {
    if (selectedKey && options.some((o) => o.key === selectedKey)) return;
    const portfolioId = params.get('portfolio');
    const symbol = params.get('symbol');
    const match =
      options.find((o) => o.portfolioId === portfolioId && o.holding.symbol === symbol) ??
      options.find((o) => o.portfolioId === portfolioId) ??
      options[0];
    if (match) setSelectedKey(match.key);
  }, [options, params, selectedKey]);

  const selected = options.find((o) => o.key === selectedKey);
  const holding = selected?.holding;
  const quote = useStockQuote(holding?.symbol);
  const livePrice = quote.data?.currentPrice ?? null;
  const priceText = priceInput ?? (livePrice !== null ? String(livePrice) : '');
  const marketPrice = priceText.trim() === '' ? 0 : Number(priceText);
  const target = targetInput.trim() === '' ? 0 : Number(targetInput);
  const budget = budgetInput.trim() === '' ? null : Number(budgetInput);
  const feePercent = feeOn ? Number(feeInput) || 0 : 0;

  const plan = useMemo(() => {
    if (!holding || marketPrice <= 0 || target <= 0) return null;
    return planAverage({
      shares: holding.shares,
      averagePrice: holding.averagePurchasePrice,
      marketPrice,
      target,
      direction,
      budget,
      feePercent,
    });
  }, [holding, marketPrice, target, direction, budget, feePercent]);

  const ok = plan?.ok ? (plan as AverageDownSuccess) : null;
  const scenarios = useMemo(() => {
    if (!ok || !holding) return [];
    const quantities = [50, 100, 200, ok.sharesForTarget, ok.sharesForTarget * 2, ok.sharesForTarget + 100];
    return whatIfScenarios(
      {
        shares: holding.shares,
        averagePrice: holding.averagePurchasePrice,
        marketPrice,
        target,
        direction,
        feePercent,
      },
      quantities,
    );
  }, [ok, holding, marketPrice, target, direction, feePercent]);

  const changeHolding = (key: string) => {
    setSelectedKey(key);
    setPriceInput(null);
    setTargetInput('');
    setBudgetInput('');
    setDirection('down');
  };

  const bigInvestment =
    ok !== null && holding !== undefined && ok.cashRequired > 5 * holding.shares * marketPrice;

  const confirmApply = async () => {
    if (!ok || !selected) return;
    setApplying(true);
    try {
      await buyInto(selected.portfolioId, {
        holdingId: selected.holding.id,
        shares: ok.sharesToBuy,
        pricePerShare: marketPrice,
        date: new Date().toISOString().slice(0, 10),
      });
      addNotification({
        type: 'success',
        title: `Bought ${ok.sharesToBuy.toLocaleString('en-PK')} ${selected.holding.symbol}`,
        message: `Average moved to ${formatPrice(ok.newAverage)}.`,
      });
      setApplyOpen(false);
      setTargetInput('');
      setPriceInput(null);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not record the purchase',
        message: (err as Error).message,
      });
    } finally {
      setApplying(false);
    }
  };

  if (options.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Average Down Planner"
          description="Find the shares and cash needed to reach a target average."
          breadcrumbs={[{ label: 'Portfolios', to: ROUTES.PORTFOLIOS }]}
        />
        <EmptyState
          icon={<Calculator className="h-6 w-6" />}
          title="No holdings yet"
          description="Add a holding to a portfolio first — the planner reads its shares and average price."
          action={<Button onClick={() => navigate(ROUTES.PORTFOLIOS)}>Go to portfolios</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Average Down Planner"
        description="Two ways in: plan a buy to a target average, or see how many shares your budget buys."
        breadcrumbs={[{ label: 'Portfolios', to: ROUTES.PORTFOLIOS }]}
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as 'average' | 'spend')}>
        <TabsList className="w-full sm:w-auto" aria-label="Calculator">
          <TabsTrigger value="average" className="flex-1 sm:flex-none">
            Average down
          </TabsTrigger>
          <TabsTrigger value="spend" className="flex-1 sm:flex-none">
            Spend an amount
          </TabsTrigger>
        </TabsList>

        <TabsContent value="average">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TradeContext
              idPrefix="planner"
              options={options}
              selectedKey={selectedKey}
              onHoldingChange={changeHolding}
              holding={holding}
              priceText={priceText}
              onPriceChange={setPriceInput}
              onUseLive={() => setPriceInput(null)}
              priceOverridden={priceInput !== null}
              livePrice={livePrice}
              quoteLoading={quote.isLoading}
              feeOn={feeOn}
              onFeeChange={setFeeOn}
              feeInput={feeInput}
              onFeeInputChange={setFeeInput}
            />

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Direction</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['down', 'Bring it down'],
                    ['up', 'Bring it up'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={direction === value}
                    onClick={() => setDirection(value)}
                    className={
                      direction === value
                        ? 'h-10 rounded-lg border border-primary bg-primary/10 text-sm font-medium text-primary'
                        : 'h-10 rounded-lg border bg-background text-sm text-muted-foreground hover:text-foreground'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="planner-target">Target average</Label>
              <Input
                id="planner-target"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder={holding ? holding.averagePurchasePrice.toFixed(2) : '0.00'}
                className={NUMBER_FIELD}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planner-budget">Max budget (optional)</Label>
              <Input
                id="planner-budget"
                type="number"
                inputMode="decimal"
                step="1000"
                min="0"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="No limit"
                className={NUMBER_FIELD}
              />
            </div>

          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card aria-live="polite">
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <CardTitle className="text-base">Result</CardTitle>
              {ok && (
                <Badge variant={ok.direction === 'down' ? 'profit' : 'warning'}>
                  {ok.direction === 'down' ? 'Averaging down' : 'Averaging up'}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {plan === null && (
                <p className="py-6 text-sm text-muted-foreground">
                  Choose a holding and enter a target average to see the plan.
                </p>
              )}

              {plan !== null && !plan.ok && (
                <div
                  data-testid="plan-message"
                  className="flex gap-3 rounded-lg border border-loss/30 bg-loss-light p-4 text-sm text-loss-dark"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>{plan.message}</p>
                </div>
              )}

              {ok && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Shares to buy
                      </p>
                      <p
                        data-testid="plan-shares"
                        className="font-mono text-3xl font-semibold tabular-nums text-profit"
                      >
                        {ok.sharesToBuy.toLocaleString('en-PK')}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        need {ok.sharesExact.toFixed(2)} shares
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Amount to pay
                      </p>
                      <p
                        data-testid="plan-cash"
                        className="font-mono text-base font-semibold tabular-nums text-foreground sm:text-xl"
                      >
                        {formatPkr(ok.cashRequired)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {ok.fees > 0
                          ? `${formatPkr(ok.grossCost)} + ${formatPkr(ok.fees)} fees`
                          : 'No fees included'}
                      </p>
                    </div>
                  </div>

                  {ok.budgetCapped && (
                    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-light p-3 text-sm text-warning-dark">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>
                        Your budget buys <strong>{ok.sharesToBuy.toLocaleString('en-PK')}</strong>{' '}
                        of the {ok.sharesForTarget.toLocaleString('en-PK')} shares needed. Best reachable
                        average: <strong>{formatPrice(ok.achievableAverage ?? ok.newAverage)}</strong> —
                        still{' '}
                        <strong>{formatPrice(Math.abs(ok.targetGap ?? 0))}</strong>{' '}
                        {(ok.targetGap ?? 0) > 0 ? 'above' : 'below'} target.
                      </p>
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat
                      label="New average"
                      value={formatPrice(ok.newAverage)}
                      hint={`Break-even price`}
                    />
                    <Stat
                      label="Average change"
                      value={`${ok.averageReduction >= 0 ? '−' : '+'}${Math.abs(
                        ok.averageReduction,
                      ).toFixed(2)}`}
                      hint={`${Math.abs(ok.averageReductionPercent).toFixed(2)}% ${
                        ok.direction === 'down' ? 'lower' : 'higher'
                      }`}
                    />
                    <Stat
                      label="New shares"
                      value={ok.totalShares.toLocaleString('en-PK')}
                      hint="Including this buy"
                    />
                    <Stat label="New invested" value={formatPkr(ok.newInvested)} />
                  </dl>

                  {bigInvestment && (
                    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-light p-3 text-sm text-warning-dark">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>
                        This purchase is more than five times your current position. Check the
                        target before proceeding.
                      </p>
                    </div>
                  )}

                  <Button className="w-full sm:w-auto" onClick={() => setApplyOpen(true)}>
                    <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
                    Apply to portfolio
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {ok && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average price vs shares bought</CardTitle>
              </CardHeader>
              <CardContent>
                <AveragePriceChart
                  input={{
                    shares: holding!.shares,
                    averagePrice: holding!.averagePurchasePrice,
                    marketPrice,
                    target,
                    direction,
                    feePercent,
                  }}
                  target={target}
                  maxShares={Math.max(ok.sharesForTarget * 2, 100)}
                />
                <p className="mt-1 text-center text-[11px] text-muted-foreground">Shares bought</p>
              </CardContent>
            </Card>
          )}

          {ok && scenarios.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What if?</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-[11px] tabular-nums sm:text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Shares</th>
                      <th className="pb-2 text-right font-medium">Cash</th>
                      <th className="pb-2 text-right font-medium">New avg</th>
                      <th className="pb-2 text-right font-medium">vs target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {scenarios.map((row) => {
                      const hit = row.reachesTarget;
                      const delta = Math.abs(row.distanceToTarget) < 0.005 ? 0 : row.distanceToTarget;
                      return (
                        <tr key={row.shares}>
                          <td className="py-2 font-mono">{row.shares.toLocaleString('en-PK')}</td>
                          <td className="py-2 text-right font-mono">
                            {formatPkr(row.cashRequired).replace(/\.00$/, '')}
                          </td>
                          <td className="py-2 text-right font-mono">{row.newAverage.toFixed(2)}</td>
                          <td
                            className={
                              hit
                                ? 'py-2 text-right font-mono text-profit'
                                : 'py-2 text-right font-mono text-loss'
                            }
                          >
                            {delta === 0
                              ? '0.00'
                              : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
          </div>
        </TabsContent>

        <TabsContent value="spend">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stock &amp; charges</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TradeContext
                  idPrefix="spend"
                  options={options}
                  selectedKey={selectedKey}
                  onHoldingChange={changeHolding}
                  holding={holding}
                  priceText={priceText}
                  onPriceChange={setPriceInput}
                  onUseLive={() => setPriceInput(null)}
                  priceOverridden={priceInput !== null}
                  livePrice={livePrice}
                  quoteLoading={quote.isLoading}
                  feeOn={feeOn}
                  onFeeChange={setFeeOn}
                  feeInput={feeInput}
                  onFeeInputChange={setFeeInput}
                />
              </CardContent>
            </Card>

            <BudgetCalculator
              symbol={holding?.symbol ?? ''}
              marketPrice={marketPrice}
              feePercent={feePercent}
            />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add this purchase?</DialogTitle>
            <DialogDescription>
              This records a real buy in your portfolio — the holding and its average update
              immediately.
            </DialogDescription>
          </DialogHeader>
          {ok && holding && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
              <p>
                Buy <strong>{ok.sharesToBuy.toLocaleString('en-PK')}</strong> shares of{' '}
                <strong>{holding.symbol}</strong> at{' '}
                <strong>{formatPrice(marketPrice)}</strong> in {selected?.portfolioName}.
              </p>
              <p>
                Cash: <strong>{formatPkr(ok.cashRequired)}</strong> · Average:{' '}
                <strong>{formatPrice(holding.averagePurchasePrice)}</strong> →{' '}
                <strong>{formatPrice(ok.newAverage)}</strong>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={confirmApply} disabled={applying}>
              {applying ? 'Recording…' : 'Confirm purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
