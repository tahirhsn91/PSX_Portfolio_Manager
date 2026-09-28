/**
 * Shaping the Market page's lists.
 *
 * The overview's gainers / losers / most-traded lists can be filled by either of two
 * sources — sarmaaya.pk's snapshot, or the PSX feed's own ranking when sarmaaya is
 * unreachable — and the page renders one shape whichever answered. That adaptation,
 * with the "a missing figure is an em dash, never a 0" rule that goes with it, lives
 * here rather than inside the page so the page stays a rendering concern and this is
 * testable on its own.
 */
import type { SarmaayaRow, StockQuote } from '@/types';
import { formatCompactNumber, formatPercent } from '@/utils';

/** How many gainers and losers each card lists. */
export const MOVERS = 5;

/**
 * How many of the traded scrips the Active Stocks tab renders.
 *
 * The source carries ~484 of them; rendering every row (and a card per row on a
 * phone) costs more than it tells the reader, so the list is capped and says so.
 */
export const ACTIVE_CAP = 100;

/** One shape for the list and the table, whichever source filled them. */
export interface ListRow {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  marketCap: number | null;
}

export const fromSarmaaya = (r: SarmaayaRow): ListRow => ({
  symbol: r.symbol,
  name: r.name,
  price: r.price,
  changePercent: r.changePercent,
  volume: r.volume,
  marketCap: r.marketCap,
});

export const fromQuote = (q: StockQuote): ListRow => ({
  symbol: q.symbol,
  name: q.companyName,
  price: q.currentPrice ?? null,
  changePercent: q.changePercent ?? null,
  volume: q.volume ?? null,
  marketCap: q.marketCap ?? null,
});

/** An index level with thousands separators, or an em dash when the source sends none. */
export const levelText = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : v.toLocaleString());

/** A whole-market volume in the page's compact units, or an em dash. */
export const compactText = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : formatCompactNumber(v);

/** `formatPercent` takes a number — a missing change has to read as an em dash, not 0.00%. */
export const pct = (v: number | null) => (v == null || Number.isNaN(v) ? '—' : formatPercent(v));

/**
 * The ink for a signed move. Money only: green is a gain and red is a loss, and
 * nothing else in this app may borrow either — the action colour is `primary`.
 */
export const changeTone = (v: number | null | undefined): string =>
  (v ?? 0) >= 0 ? 'text-profit' : 'text-loss';

/** The company name trimmed to a row's worth of words, so a long name can't push the price off. */
export const shortName = (name: string, words = 3) => name.split(' ').slice(0, words).join(' ');
