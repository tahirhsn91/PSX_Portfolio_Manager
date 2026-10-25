/**
 * Price alerts (issue #94).
 *
 * Definitions the user manages; the engine (useAlertEngine) evaluates them
 * while the app is open. A target/stop here is a notification condition —
 * it is never an order and is only as fresh as the feed.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Trash2, Plus } from 'lucide-react';
import { ConfirmDialog, PageHeader, EmptyState, ErrorState } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { alertsApi } from '@/services';
import { useUIStore } from '@/store';
import { formatCurrency } from '@/utils';
import type { Alert, AlertInput, AlertKind, AlertDirection } from '@/types';

function describeAlert(a: Alert): string {
  if (a.kind === 'price') {
    return a.direction === 'above'
      ? `rises to ${formatCurrency(a.threshold)}`
      : `falls to ${formatCurrency(a.threshold)}`;
  }
  return a.direction === 'above' ? `rises ${a.threshold}% today` : `falls ${a.threshold}% today`;
}

export function Alerts() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore((s) => s.addNotification);

  const { data: alerts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['alerts'],
    queryFn: alertsApi.list,
  });

  const [symbol, setSymbol] = useState('');
  const [kind, setKind] = useState<AlertKind>('price');
  const [direction, setDirection] = useState<AlertDirection>('above');
  const [threshold, setThreshold] = useState('');
  const [alertToDelete, setAlertToDelete] = useState<Alert | null>(null);

  const create = useMutation({
    mutationFn: (input: AlertInput) => alertsApi.create(input),
    onSuccess: (_alert, input) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setSymbol('');
      setThreshold('');
      addNotification({ type: 'success', title: `Alert set on ${input.symbol}` });
    },
    onError: (err) =>
      addNotification({ type: 'error', title: 'Could not set the alert', message: (err as Error).message }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => alertsApi.update(id, { active }),
    onSuccess: (_alert, variables) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      addNotification({
        type: 'info',
        title: variables.active ? 'Alert resumed' : 'Alert paused',
        message: 'In-app notifications only fire while the PSX market is open.',
      });
    },
    onError: (err) =>
      addNotification({
        type: 'error',
        title: 'Could not update the alert',
        message: (err as Error).message,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => alertsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      addNotification({ type: 'info', title: 'Alert deleted' });
      setAlertToDelete(null);
    },
    onError: (err) =>
      addNotification({ type: 'error', title: 'Could not delete the alert', message: (err as Error).message }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = Number(threshold);
    if (!symbol.trim() || !Number.isFinite(t)) return;
    create.mutate({ symbol, kind, direction, threshold: t });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Alerts' }]}
        title="Price alerts"
        description="Tell me when a price crosses a level, or a stock moves sharply — while the app is open."
      />

      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Alerts are checked only while the app is open, and are only as fresh as the feed
            (refreshed every 60s). A target or stop is a notification — it is never an executed order.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Symbol</label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. ENGROH"
                />
              </div>
              <div>
                <label htmlFor="alert-condition" className="mb-1 block text-sm font-medium">
                  Condition
                </label>
                <select
                  id="alert-condition"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AlertKind)}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="price">Price level</option>
                  <option value="percent">Percent move</option>
                </select>
              </div>
              <div>
                <label htmlFor="alert-direction" className="mb-1 block text-sm font-medium">
                  When it
                </label>
                <select
                  id="alert-direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as AlertDirection)}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="above">{kind === 'price' ? 'rises to' : 'rises by'}</option>
                  <option value="below">{kind === 'price' ? 'falls to' : 'falls by'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="alert-threshold" className="mb-1 block text-sm font-medium">
                  {kind === 'price' ? 'Price (Rs)' : 'Percent (%)'}
                </label>
                <Input
                  id="alert-threshold"
                  type="number"
                  min="0"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={kind === 'price' ? '400' : '5'}
                />
              </div>
            </div>
            <Button type="submit" disabled={create.isPending}>
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              {create.isPending ? 'Setting…' : 'Set alert'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 pt-4" aria-busy="true">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </CardContent>
        </Card>
      ) : isError ? (
        <ErrorState
          title="Could not load your alerts"
          description="The alert list did not arrive from the server. Nothing has been deleted."
          onRetry={() => void refetch()}
        />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title="No alerts yet"
          description="Add one above — it'll notify you in-app when the condition is met."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="divide-y">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <span className={`font-mono text-sm font-semibold ${alert.active ? '' : 'text-muted-foreground line-through'}`}>
                      {alert.symbol}
                    </span>
                    <p className="truncate text-sm text-muted-foreground">{describeAlert(alert)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={toggle.isPending && toggle.variables?.id === alert.id}
                      onClick={() => toggle.mutate({ id: alert.id, active: !alert.active })}
                    >
                      {alert.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${alert.symbol} alert`}
                      loading={remove.isPending && remove.variables === alert.id}
                      onClick={() => setAlertToDelete(alert)}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!alertToDelete}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setAlertToDelete(null);
        }}
        title={`Delete the ${alertToDelete?.symbol ?? ''} alert?`}
        description={
          alertToDelete
            ? `${describeAlert(alertToDelete)} — this condition and its history are removed. It cannot be undone.`
            : ''
        }
        confirmLabel="Delete alert"
        pendingLabel="Deleting…"
        destructive
        pending={remove.isPending}
        onConfirm={() => alertToDelete && remove.mutate(alertToDelete.id)}
      />
    </div>
  );
}
