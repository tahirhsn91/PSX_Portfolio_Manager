/**
 * Alert engine (issue #94) — evaluates alerts while the app is open.
 *
 * Mounted once in the layout, so it runs on every page. It polls live quotes
 * (via useStockQuotes) and fires an in-app notification the first time an
 * alert's condition becomes true, then stays quiet until the condition resets
 * — edge-triggered, not level-triggered, so a held level doesn't spam.
 *
 * First release: in-app only. No background/email/push, and a trigger is a
 * notification condition, never an executed order.
 */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '@/services';
import { useStockQuotes } from './useMarketData';
import { useMarketStore, useUIStore } from '@/store';
import { formatCurrency } from '@/utils';
import type { Alert, StockQuote } from '@/types';

export function isTriggered(alert: Alert, quote: StockQuote | undefined): boolean {
  if (!quote || quote.priceAvailable === false) return false;
  if (alert.kind === 'price') {
    return alert.direction === 'above'
      ? quote.currentPrice >= alert.threshold
      : quote.currentPrice <= alert.threshold;
  }
  // percent: the day's move vs previous close. 'below' means "falls by X%".
  return alert.direction === 'above'
    ? quote.changePercent >= alert.threshold
    : quote.changePercent <= -alert.threshold;
}

export function useAlertEngine() {
  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: alertsApi.list,
    refetchInterval: 60_000,
  });

  const active = alerts.filter((a) => a.active);
  const symbols = [...new Set(active.map((a) => a.symbol))];
  useStockQuotes(symbols);

  const quotes = useMarketStore((s) => s.quotes);
  const addNotification = useUIStore((s) => s.addNotification);
  const lastState = useRef<Record<string, boolean>>({});

  useEffect(() => {
    for (const alert of active) {
      const quote = quotes[alert.symbol]?.data;
      const triggered = isTriggered(alert, quote);
      const was = lastState.current[alert.id] ?? false;

      if (triggered && !was && quote && quote.priceAvailable !== false) {
        const level =
          alert.kind === 'price' ? formatCurrency(alert.threshold) : `${alert.threshold}%`;
        const verb = alert.direction === 'above' ? 'reached' : 'fell to';
        addNotification({
          type: 'warning',
          title: `${alert.symbol} alert`,
          message: `${alert.symbol} ${verb} ${level} — now ${formatCurrency(quote.currentPrice)}`,
        });
      }

      lastState.current[alert.id] = triggered;
    }
  }, [active, quotes, addNotification]);
}
