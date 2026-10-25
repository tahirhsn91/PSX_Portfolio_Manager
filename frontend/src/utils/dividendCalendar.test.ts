import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  dayKey,
  eventTotal,
  groupDividendsByDate,
  type DividendCalendarEvent,
} from './dividendCalendar';
import type { DeclaredDividend, DividendAnnouncement, DividendRecord, Holding } from '@/types';

function holding(
  symbol: string,
  declared: DeclaredDividend[] = [],
  received: DividendRecord[] = [],
  shares = 100,
): Holding {
  return {
    symbol,
    companyName: `${symbol} Ltd`,
    shares,
    declaredDividends: declared,
    dividendsReceived: received,
  } as unknown as Holding;
}

function announcement(symbol: string, amount: number, date: string): DividendAnnouncement {
  return {
    symbol,
    companyName: `${symbol} Ltd`,
    amountPerShare: amount,
    announcementDate: date,
    exDate: null,
    bookClosure: null,
    paymentDate: null,
    status: 'unknown',
    price: null,
    yieldTtm: null,
  };
}

function declared(id: string, amountPerShare: number, paymentDate?: string): DeclaredDividend {
  return { id, holdingId: 'h', amountPerShare, paymentDate };
}

function received(id: string, date: string, amountPerShare: number, totalAmount: number): DividendRecord {
  return { id, holdingId: 'h', date, amountPerShare, totalAmount, type: 'cash' };
}

describe('dayKey', () => {
  it('formats a local date as yyyy-MM-dd', () => {
    expect(dayKey(new Date(2026, 2, 15))).toBe('2026-03-15');
    expect(dayKey(new Date(2026, 11, 1))).toBe('2026-12-01');
  });
});

describe('buildMonthGrid', () => {
  it('returns six Monday-first weeks of 42 consecutive cells', () => {
    const grid = buildMonthGrid(2026, 1); // February 2026
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);

    const flat = grid.flat();
    expect(flat).toHaveLength(42);
    expect(flat[0].getDay()).toBe(1); // Monday
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i].getTime() - flat[i - 1].getTime()).toBe(86_400_000);
    }
  });

  it('contains the first day of the month exactly once', () => {
    const grid = buildMonthGrid(2026, 1);
    const firsts = grid
      .flat()
      .filter((d) => d.getFullYear() === 2026 && d.getMonth() === 1 && d.getDate() === 1);
    expect(firsts).toHaveLength(1);
  });
});

describe('groupDividendsByDate', () => {
  it('places declared on their payment date and received on their date', () => {
    const g = groupDividendsByDate([
      holding('ABC', [declared('d1', 5, '2026-05-01')], [received('r1', '2026-04-15', 4, 400)]),
    ]);
    expect(g.byDate.get('2026-05-01')?.[0].kind).toBe('declared');
    expect(g.byDate.get('2026-04-15')?.[0].kind).toBe('received');
    expect(g.undated).toHaveLength(0);
  });

  it('collects declared dividends with no payment date as undated', () => {
    const g = groupDividendsByDate([holding('ABC', [declared('d1', 5)])]);
    expect(g.byDate.size).toBe(0);
    expect(g.undated).toHaveLength(1);
    expect(g.undated[0].dividend.id).toBe('d1');
  });

  it('groups multiple dividends on one day, declared before received', () => {
    const g = groupDividendsByDate([
      holding('AAA', [declared('d1', 5, '2026-06-10')]),
      holding('BBB', [], [received('r1', '2026-06-10', 3, 300)]),
    ]);
    const events = g.byDate.get('2026-06-10');
    expect(events).toHaveLength(2);
    expect(events?.[0].kind).toBe('declared');
    expect(events?.[1].kind).toBe('received');
  });

  it('computes nextDate as the soonest event on or after today', () => {
    expect(groupDividendsByDate([holding('AAA', [declared('d1', 5, '2000-01-01')])]).nextDate).toBeNull();
    expect(groupDividendsByDate([holding('AAA', [declared('d1', 5, '2099-01-01')])]).nextDate).toBe('2099-01-01');
  });

  it('places feed announcements on their announcement date, for held symbols only', () => {
    const g = groupDividendsByDate(
      [holding('EFERT', [], [], 77)],
      [announcement('EFERT', 5.5, '2026-10-30'), announcement('HUBC', 5, '2026-10-30')],
    );

    const events = g.byDate.get('2026-10-30') ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'announced', holding: { symbol: 'EFERT' } });
    expect(g.nextDate).toBe('2026-10-30');
  });

  it('orders a day declared, then announced, then received', () => {
    const g = groupDividendsByDate(
      [
        holding('AAA', [declared('d1', 5, '2099-06-10')], [received('r1', '2099-06-10', 3, 300)]),
        holding('BBB', [], [], 10),
      ],
      [announcement('BBB', 2, '2099-06-10')],
    );

    expect((g.byDate.get('2099-06-10') ?? []).map((e) => e.kind)).toEqual([
      'declared',
      'announced',
      'received',
    ]);
  });

  it('does not mark an announcement for a symbol the portfolio no longer holds', () => {
    const g = groupDividendsByDate([holding('EFERT', [], [], 0)], [announcement('EFERT', 5.5, '2026-10-30')]);
    expect(g.byDate.size).toBe(0);
  });
});

describe('eventTotal', () => {
  it('multiplies shares for declared, returns stored total for received', () => {
    const declaredEvent = {
      kind: 'declared',
      dividend: declared('d1', 5, '2026-06-10'),
      holding: { symbol: 'X', shares: 100 },
    } as DividendCalendarEvent;
    expect(eventTotal(declaredEvent)).toBe(500);

    const receivedEvent = {
      kind: 'received',
      dividend: received('r1', '2026-06-10', 3, 300),
      holding: { symbol: 'X' },
    } as DividendCalendarEvent;
    expect(eventTotal(receivedEvent)).toBe(300);
  });

  it('multiplies shares for an announced payout too', () => {
    const announcedEvent = {
      kind: 'announced',
      announcement: announcement('X', 2.5, '2026-10-30'),
      holding: { symbol: 'X', shares: 40 },
    } as DividendCalendarEvent;
    expect(eventTotal(announcedEvent)).toBe(100);
  });
});
