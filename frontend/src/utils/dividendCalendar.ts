/**
 * Pure helpers for the dividend calendar: building a month grid and grouping a
 * portfolio's dividends (declared + received) by the day they land on.
 *
 * All date work runs on local calendar days as 'yyyy-MM-dd' string keys — never
 * through `new Date('yyyy-MM-dd')`, which parses as UTC midnight and can shift
 * the day by one in a negative-offset timezone. Lookups compare strings, so the
 * grouping is timezone-safe by construction.
 */
import type { Holding, DeclaredDividend, DividendRecord, DividendAnnouncement } from '@/types';

/** A dividend shown on the calendar, with the holding it belongs to. */
export type DividendCalendarEvent =
  | { kind: 'declared'; dividend: DeclaredDividend; holding: Holding }
  /** Feed-driven: positioned on its announcement date, because the feed publishes no pay date. */
  | { kind: 'announced'; announcement: DividendAnnouncement; holding: Holding }
  | { kind: 'received'; dividend: DividendRecord; holding: Holding };

/** Rank inside a day: an upcoming payout sorts above a paid one. */
const KIND_RANK: Record<DividendCalendarEvent['kind'], number> = {
  declared: 0,
  announced: 1,
  received: 2,
};

/** A declared dividend with no payment date — it has no calendar position. */
export interface UndatedDeclared {
  dividend: DeclaredDividend;
  holding: Holding;
}

export interface GroupedDividends {
  /** 'yyyy-MM-dd' → events for that day (declared first, then received, by symbol). */
  byDate: Map<string, DividendCalendarEvent[]>;
  /** Declared dividends without a payment date, sorted by announcement date then symbol. */
  undated: UndatedDeclared[];
  /** The soonest event date at or after today, if any — the "jump to next" target. */
  nextDate: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local 'yyyy-MM-dd' key for a Date — never `toISOString()` (UTC shift). */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's local 'yyyy-MM-dd' key. */
export function todayKey(): string {
  return dayKey(new Date());
}

/** Monday-first labels for the weekday header row. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Six fixed weeks of the given month as local `Date` objects (42 cells, so the
 * grid height is stable month to month), Monday-first. Every cell is
 * `new Date(y, m, d)` — local midnight — so `getFullYear`/`getMonth`/`getDate`
 * round-trip the intended day.
 */
export function buildMonthGrid(year: number, month: number): Date[][] {
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const cells: Date[] = [];
  // Leading days from the previous month.
  for (let i = startWeekday - 1; i >= 0; i--) cells.push(new Date(year, month, -i));
  // The month itself.
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) cells.push(new Date(year, month, d));
  // Trailing days to fill the sixth week.
  for (let i = 1; cells.length < 42; i++) cells.push(new Date(year, month + 1, i));

  const weeks: Date[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * Group a portfolio's holdings into calendar days. Declared dividends land on
 * their `paymentDate`; received dividends on their `date`. A declared dividend
 * with no payment date has no grid position and is returned separately so the UI
 * can show it instead of silently dropping it.
 */
export function groupDividendsByDate(
  holdings: Holding[],
  announcements: DividendAnnouncement[] = [],
): GroupedDividends {
  const byDate = new Map<string, DividendCalendarEvent[]>();
  const undated: UndatedDeclared[] = [];

  const push = (key: string, event: DividendCalendarEvent) => {
    const list = byDate.get(key) ?? [];
    list.push(event);
    byDate.set(key, list);
  };

  for (const holding of holdings) {
    for (const dividend of holding.declaredDividends ?? []) {
      if (!dividend.paymentDate) {
        undated.push({ dividend, holding });
        continue;
      }
      push(dividend.paymentDate.slice(0, 10), { kind: 'declared', dividend, holding });
    }
    for (const dividend of holding.dividendsReceived ?? []) {
      push(dividend.date.slice(0, 10), { kind: 'received', dividend, holding });
    }
  }

  // Announced payouts from the feed: a holding can carry one, and it lands on the
  // announcement date — the only date the feed publishes. Never shifted onto a
  // payment date it did not give.
  if (announcements.length > 0) {
    const held = new Map(holdings.map((holding) => [holding.symbol.toUpperCase(), holding]));
    for (const announcement of announcements) {
      const holding = held.get(announcement.symbol.toUpperCase());
      if (!holding || holding.shares <= 0) continue;
      push(announcement.announcementDate.slice(0, 10), {
        kind: 'announced',
        announcement,
        holding,
      });
    }
  }

  // Deterministic per-day order: declared (upcoming) first, then announced, then
  // received (paid), each by symbol.
  for (const list of byDate.values()) {
    list.sort(
      (a, b) =>
        KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.holding.symbol.localeCompare(b.holding.symbol),
    );
  }

  undated.sort(
    (a, b) =>
      (a.dividend.announcementDate ?? '').localeCompare(b.dividend.announcementDate ?? '') ||
      a.holding.symbol.localeCompare(b.holding.symbol),
  );

  const today = todayKey();
  let nextDate: string | null = null;
  for (const key of [...byDate.keys()].sort()) {
    if (key >= today) {
      nextDate = key;
      break;
    }
  }

  return { byDate, undated, nextDate };
}

/** Total PKR for a calendar event: shares × per-share, or the stored received total. */
export function eventTotal(event: DividendCalendarEvent): number {
  switch (event.kind) {
    case 'declared':
      return event.holding.shares * event.dividend.amountPerShare;
    case 'announced':
      return event.holding.shares * event.announcement.amountPerShare;
    case 'received':
      return event.dividend.totalAmount;
  }
}
