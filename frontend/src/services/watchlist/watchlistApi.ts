/**
 * The watchlist API — a personal list of symbols tracked but not owned (issue #93).
 *
 * Server-backed and keyed to the account, exactly like portfolios. Only the
 * symbol list is stored here; pricing is the live feed's job, fetched at render
 * time so no stale price is ever persisted.
 */

import { request } from '../http';
import type { WatchlistItem } from '@/types';

const BASE = '/api/watchlist';

interface WatchlistEnvelope {
  item: WatchlistItem;
}
interface WatchlistListEnvelope {
  items: WatchlistItem[];
}

export const watchlistApi = {
  list: async (): Promise<WatchlistItem[]> => {
    const { items } = await request<WatchlistListEnvelope>(BASE);
    return items;
  },

  add: async (symbol: string): Promise<WatchlistItem> => {
    const { item } = await request<WatchlistEnvelope>(BASE, {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    });
    return item;
  },

  remove: async (symbol: string): Promise<void> => {
    await request<null>(`${BASE}/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
  },
};
