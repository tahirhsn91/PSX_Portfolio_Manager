/**
 * sarmaaya.pk's tape — the Market page's gainers / losers / most-traded lists.
 *
 * A *second* source beside the configured provider, not a replacement: the KSE-100
 * banner and the Sectors tab still come from VITE_MARKET_PROVIDER. It exists because
 * the feed's tracked list is served alphabetically over three pages that take ~10-16s
 * each, so the overview sat empty for ~30s — and stayed empty if any page failed.
 * sarmaaya answers the whole market in two sub-second calls.
 *
 * The call goes through this project's own proxy (`/api/sarmaaya/market`): sarmaaya's
 * API sends no CORS headers, so the browser cannot read it directly, and the proxy
 * also caches the snapshot for a minute.
 */

import type { SarmaayaMarketSnapshot } from '@/types';

function proxyBase(): string {
  return (import.meta.env.VITE_PROXY_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

export async function fetchSarmaayaMarket(limit = 5): Promise<SarmaayaMarketSnapshot> {
  const res = await fetch(`${proxyBase()}/api/sarmaaya/market?limit=${limit}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: { message?: string } | string;
    };
    const msg =
      (typeof body?.error === 'object' ? body.error?.message : (body?.error as string | undefined)) ??
      body?.message ??
      `HTTP ${res.status}`;
    throw new Error(`sarmaaya.pk: ${msg}`);
  }

  return res.json() as Promise<SarmaayaMarketSnapshot>;
}
