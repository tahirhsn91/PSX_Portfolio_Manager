import type { HistoricalDataPoint } from '@/types';

/**
 * PSX session clock.
 *
 * Karachi is UTC+5 with no DST, so a fixed offset is exact. The one boundary
 * that matters here is the pre-open: a new session's order book opens at
 * **09:00 PKT**, which is when anything scoped to "today" — a day range, an
 * intraday high/low — must stop referring to the previous session.
 */
export const PKT_OFFSET_MINUTES = 5 * 60;

/** 09:00 PKT — pre-open starts, so the day range resets here. */
export const PREOPEN_START_MINUTES = 9 * 60;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const shifted = (date: Date) => new Date(date.getTime() + PKT_OFFSET_MINUTES * MINUTE_MS);

/** Minutes since midnight, Karachi time. */
export function pktMinutes(date: Date): number {
  const p = shifted(date);
  return p.getUTCHours() * 60 + p.getUTCMinutes();
}

/** Karachi calendar day as `YYYY-MM-DD`. */
export function pktDateKey(date: Date): string {
  return shifted(date).toISOString().slice(0, 10);
}

/** Mon–Fri in Karachi; PSX does not trade on weekends. */
export function isTradingDay(date: Date): boolean {
  const day = shifted(date).getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * The exchange session day a feed timestamp belongs to, as `YYYY-MM-DD`.
 *
 * The feed stamps every row with the session's close time in UTC — `11:00Z`, i.e.
 * 16:00 PKT — so reading that field as a plain datetime reports a time after the
 * close, and mid-session a time in the future. What the UI states is the *session
 * day*, so the exchange offset is applied here, once, instead of at each call site.
 */
export function feedSessionDay(raw?: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : pktDateKey(date);
}

/**
 * The session whose range should be on screen right now.
 *
 * - On a trading day at/after 09:00 PKT → **today**, so a fresh session starts
 *   with an empty range instead of inheriting yesterday's numbers.
 * - Before 09:00, or on a weekend → the **previous** session, because its range
 *   is still the most recent one; blanking the card overnight would be noise,
 *   not accuracy.
 */
export function activeSessionDate(now: Date = new Date()): string {
  let cursor = now;
  const currentSessionStarted =
    isTradingDay(cursor) && pktMinutes(cursor) >= PREOPEN_START_MINUTES;
  if (!currentSessionStarted) cursor = new Date(cursor.getTime() - DAY_MS);
  while (!isTradingDay(cursor)) cursor = new Date(cursor.getTime() - DAY_MS);
  return pktDateKey(cursor);
}

/**
 * The most recent day PSX actually traded, on or before `date`.
 *
 * A position can only have been bought on a session, so a form that defaults to
 * "today" proposes a date the calendar itself refuses to accept when today is a
 * weekend. Weekends step back to Friday; PSX holidays are not modelled, so this
 * is the weekday rule and nothing more.
 */
export function mostRecentTradingDay(date: Date = new Date()): Date {
  let cursor = date;
  while (!isTradingDay(cursor)) cursor = new Date(cursor.getTime() - DAY_MS);
  return cursor;
}

export type DayRangeSource = 'exchange' | 'observed';

export interface DayRangeResult {
  /** null when nothing can honestly be shown. */
  range: { low: number; high: number; source: DayRangeSource } | null;
  /** Karachi date of the session the range belongs to. */
  sessionDate: string;
  /** false when we're showing the previous session (pre-09:00 or weekend). */
  isCurrentSession: boolean;
  /** Copy for the empty state. */
  message: string;
}

/**
 * A provider's day high/low is only usable when it brackets a plausible price.
 * The scraper currently reports `high: 48401 / low: 7` for every symbol, so this
 * guard is what keeps nonsense like a 7–48401 bar off the screen.
 */
export function isSaneDayRange(
  low: number | null | undefined,
  high: number | null | undefined,
  price: number
): boolean {
  const nums = [low, high, price];
  if (!nums.every((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
    return false;
  }
  if ((low as number) > (high as number)) return false;
  // A single session's high/low can't sit an order of magnitude from the price.
  const band = 2;
  return (low as number) * band >= price && (high as number) <= price * band;
}

/**
 * Resolve the day range for the active session.
 *
 * Prefers the exchange's own high/low when it's trustworthy, and otherwise
 * falls back to the range of prices actually recorded for that session (the
 * intraday rows the scraper stores, mapped to one point per poll). If the
 * session has no rows yet — which is exactly what the 09:00 PKT reset looks
 * like — it reports no range rather than reusing the previous session's.
 */
export function deriveDayRange(args: {
  /** History points; today's intraday rows collapse onto today's date. */
  points: HistoricalDataPoint[];
  /** Latest traded price. */
  quotePrice: number;
  /** Snapshot timestamp for the quote (StockDetail.lastUpdated). */
  quoteDate?: string | null;
  upstreamLow?: number | null;
  upstreamHigh?: number | null;
  now?: Date;
}): DayRangeResult {
  const now = args.now ?? new Date();
  const sessionDate = activeSessionDate(now);
  const isCurrentSession = sessionDate === pktDateKey(now);

  const message = isCurrentSession
    ? 'No trades recorded yet this session — the range starts once the market prints.'
    : 'No day range available for the last session.';

  const quoteDay = args.quoteDate ? pktDateKey(new Date(args.quoteDate)) : null;
  const exchangeRangeIsCurrent = quoteDay === sessionDate;
  if (
    exchangeRangeIsCurrent &&
    isSaneDayRange(args.upstreamLow, args.upstreamHigh, args.quotePrice)
  ) {
    return {
      range: { low: args.upstreamLow as number, high: args.upstreamHigh as number, source: 'exchange' },
      sessionDate,
      isCurrentSession,
      message: '',
    };
  }

  const closes = args.points
    .filter((p) => p.date === sessionDate && Number.isFinite(p.close) && p.close > 0)
    .map((p) => p.close);

  if (closes.length === 0) return { range: null, sessionDate, isCurrentSession, message };

  return {
    range: { low: Math.min(...closes), high: Math.max(...closes), source: 'observed' },
    sessionDate,
    isCurrentSession,
    message: '',
  };
}
