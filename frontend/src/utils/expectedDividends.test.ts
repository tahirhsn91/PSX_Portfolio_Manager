import { describe, expect, it } from 'vitest';
import type { DividendAnnouncement, Holding } from '@/types';
import {
  clampWithholdingRate,
  summariseExpectedDividends,
  type HoldingRef,
} from '@/utils/expectedDividends';

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: 'h1',
    portfolioId: 'p1',
    companyName: 'Engro Fertilizers Limited',
    symbol: 'EFERT',
    sector: 'Fertilizer',
    shares: 77,
    averagePurchasePrice: 132.49,
    purchaseDate: '2026-01-05',
    dividendsReceived: [],
    buys: [],
    ...overrides,
  };
}

function announcement(overrides: Partial<DividendAnnouncement> = {}): DividendAnnouncement {
  return {
    symbol: 'EFERT',
    companyName: 'Engro Fertilizers Limited',
    amountPerShare: 5.5,
    announcementDate: '2026-10-30',
    exDate: null,
    bookClosure: null,
    paymentDate: null,
    status: 'unknown',
    price: 194.06,
    yieldTtm: 9.15,
    ...overrides,
  };
}

const ref = (holdings: Holding[], portfolioName = 'Main'): HoldingRef[] =>
  holdings.map((h) => ({ portfolioId: h.portfolioId, portfolioName, holding: h }));

describe('summariseExpectedDividends', () => {
  it('multiplies the announced amount by the shares held', () => {
    const result = summariseExpectedDividends(ref([holding()]), [announcement()]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      symbol: 'EFERT',
      shares: 77,
      amountPerShare: 5.5,
      gross: 423.5,
      net: 359.98,
    });
    expect(result.gross).toBe(423.5);
    expect(result.net).toBe(359.98);
    expect(result.payouts).toBe(1);
    expect(result.holdingsCovered).toBe(1);
    expect(result.nextDate).toBe('2026-10-30');
  });

  it('adds a second holding and reports the combined total', () => {
    const result = summariseExpectedDividends(
      ref([
        holding(),
        holding({
          id: 'h2',
          symbol: 'MCB',
          companyName: 'MCB Bank Limited',
          shares: 10,
          averagePurchasePrice: 373.6,
        }),
      ]),
      [announcement(), announcement({ symbol: 'MCB', amountPerShare: 9, announcementDate: '2026-11-02' })],
    );

    expect(result.rows.map((r) => r.symbol)).toEqual(['EFERT', 'MCB']);
    expect(result.gross).toBe(513.5);
    expect(result.net).toBe(436.48);
    expect(result.holdingsCovered).toBe(2);
    expect(result.nextDate).toBe('2026-10-30');
  });

  it('does not treat a holding with no announcement as zero — it reports it', () => {
    const result = summariseExpectedDividends(
      ref([holding(), holding({ id: 'h2', symbol: 'HUBC', companyName: 'Hub Power', shares: 85 })]),
      [announcement()],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.holdingsWithout).toEqual(['HUBC']);
    expect(result.gross).toBe(423.5);
  });

  it('counts every announcement when a symbol has more than one', () => {
    const result = summariseExpectedDividends(ref([holding()]), [
      announcement(),
      announcement({ amountPerShare: 2, announcementDate: '2026-12-15' }),
    ]);

    expect(result.rows).toHaveLength(2);
    expect(result.gross).toBe(577.5);
    expect(result.payouts).toBe(2);
    expect(result.holdingsCovered).toBe(1);
  });

  it('groups by portfolio with subtotals', () => {
    const a = holding();
    const b = holding({ id: 'h2', portfolioId: 'p2', symbol: 'MCB', shares: 10 });
    const result = summariseExpectedDividends(
      [
        { portfolioId: 'p1', portfolioName: 'Long term', holding: a },
        { portfolioId: 'p2', portfolioName: 'Trading', holding: b },
      ],
      [announcement(), announcement({ symbol: 'MCB', amountPerShare: 9, announcementDate: '2026-11-02' })],
    );

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({ portfolioName: 'Long term', gross: 423.5, net: 359.98 });
    expect(result.groups[1]).toMatchObject({ portfolioName: 'Trading', gross: 90, net: 76.5 });
    expect(result.groups[0].rows).toHaveLength(1);
  });

  it('applies the withholding rate to the net figure only', () => {
    const at30 = summariseExpectedDividends(ref([holding()]), [announcement()], 30);
    expect(at30.gross).toBe(423.5);
    expect(at30.net).toBe(296.45);
    expect(at30.rate).toBe(30);
  });

  it('expresses one payout against the position cost', () => {
    const result = summariseExpectedDividends(ref([holding()]), [announcement()]);
    // 5.5 / 132.49 = 4.15%
    expect(result.rows[0].yieldOnCost).toBe(4.15);
  });

  it('ignores a closed position and matches symbols case-insensitively', () => {
    const result = summariseExpectedDividends(
      ref([holding({ shares: 0 }), holding({ id: 'h2', symbol: 'efert' })]),
      [announcement()],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].holdingId).toBe('h2');
  });

  it('returns an empty, well-formed summary when nothing is announced', () => {
    const result = summariseExpectedDividends(ref([holding()]), []);

    expect(result).toMatchObject({
      rows: [],
      groups: [],
      gross: 0,
      net: 0,
      payouts: 0,
      holdingsCovered: 0,
      nextDate: null,
    });
    expect(result.holdingsWithout).toEqual(['EFERT']);
  });
});

describe('clampWithholdingRate', () => {
  it('defaults to 15 and bounds the input', () => {
    expect(clampWithholdingRate(undefined)).toBe(15);
    expect(clampWithholdingRate(Number.NaN)).toBe(15);
    expect(clampWithholdingRate(-5)).toBe(0);
    expect(clampWithholdingRate(99)).toBe(50);
    expect(clampWithholdingRate(30)).toBe(30);
  });
});
