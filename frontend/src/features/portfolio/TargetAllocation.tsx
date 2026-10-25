/**
 * Target allocation & concentration alerts (issue #97).
 *
 * User-defined target weights per holding or sector, compared against the live
 * allocation side by side. A per-portfolio concentration threshold flags any
 * holding or sector whose live weight exceeds it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { portfoliosApi } from '@/services';
import { useUIStore } from '@/store';
import { buildHoldingAllocation, buildSectorAllocation } from '@/utils';
import type { AllocationTargetInput, HoldingMetrics, Portfolio, TargetScope } from '@/types';

interface Row {
  key: string;
  scope: TargetScope;
  label: string;
  current: number;
}

export function TargetAllocation({
  portfolio,
  holdingMetrics,
}: {
  portfolio: Portfolio;
  holdingMetrics: HoldingMetrics[];
}) {
  const queryClient = useQueryClient();
  const addNotification = useUIStore((s) => s.addNotification);

  const { data } = useQuery({
    queryKey: ['targets', portfolio.id],
    queryFn: () => portfoliosApi.getTargets(portfolio.id),
  });

  const holdingAlloc = buildHoldingAllocation(portfolio, holdingMetrics);
  const sectorAlloc = buildSectorAllocation(portfolio, holdingMetrics);

  const threshold = data?.concentrationThreshold ?? portfolio.concentrationThreshold ?? 25;

  const [targets, setTargets] = useState<Record<string, string>>({});
  const [thresholdInput, setThresholdInput] = useState(String(threshold));

  useEffect(() => {
    if (!data) return;
    const map: Record<string, string> = {};
    for (const t of data.targets) map[`${t.scope}|${t.key}`] = String(t.targetPercent);
    setTargets(map);
    setThresholdInput(String(data.concentrationThreshold));
  }, [data]);

  const rows = useMemo<Row[]>(
    () => [
      ...holdingAlloc.map((h) => ({ key: `holding|${h.symbol}`, scope: 'holding' as const, label: h.symbol, current: h.percent })),
      ...sectorAlloc.map((s) => ({ key: `sector|${s.sector}`, scope: 'sector' as const, label: s.sector, current: s.percent })),
    ],
    [holdingAlloc, sectorAlloc],
  );

  const over = rows.filter((r) => r.current > threshold);

  const save = useMutation({
    mutationFn: () => {
      const list: AllocationTargetInput[] = [];
      for (const [k, v] of Object.entries(targets)) {
        const pct = Number(v);
        if (v.trim() === '' || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
        const sep = k.indexOf('|');
        const scope = k.slice(0, sep) as TargetScope;
        const key = k.slice(sep + 1);
        list.push({ scope, key, targetPercent: pct });
      }
      return portfoliosApi.setTargets(portfolio.id, {
        targets: list,
        concentrationThreshold: Number(thresholdInput),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', portfolio.id] });
      addNotification({ type: 'success', title: 'Allocation targets saved' });
    },
    onError: (err) =>
      addNotification({ type: 'error', title: 'Could not save targets', message: (err as Error).message }),
  });

  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target allocation</CardTitle>
        <p className="text-xs text-muted-foreground">
          Set a target weight per holding or sector; current weights come from live prices.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {over.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert aria-hidden="true" className="h-4 w-4 text-warning" />
              Concentration above {threshold}%
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {over.map((o) => `${o.label} (${o.current.toFixed(1)}%)`).join(' · ')}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {(['holding', 'sector'] as TargetScope[]).map((scope) => (
            <div key={scope} className="space-y-2">
              <div className="text-sm font-medium">{scope === 'holding' ? 'Holdings' : 'Sectors'}</div>
              {rows
                .filter((r) => r.scope === scope)
                .map((r) => (
                  <div key={r.key} className="flex items-center gap-3">
                    <span className="w-24 truncate font-mono text-sm">{r.label}</span>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      now {r.current.toFixed(1)}%
                    </span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={targets[r.key] ?? ''}
                      placeholder="target %"
                      onChange={(e) => setTargets((prev) => ({ ...prev, [r.key]: e.target.value }))}
                      className="h-8 w-24"
                    />
                  </div>
                ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Concentration threshold (%)
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              step="any"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="h-11 w-28"
            />
          </div>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save targets'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
