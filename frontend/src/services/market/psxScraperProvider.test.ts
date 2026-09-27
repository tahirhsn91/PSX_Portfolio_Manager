/**
 * The Valuation card's mapping (PSX_Scraper#79).
 *
 * These pin the rule the card depends on: a figure the feed publishes reaches the row,
 * and a figure it does not publish is `null` — which the card renders as the dash, never
 * as `0` and never as another row's number. No network, no browser: the mapping is pure.
 */

import { describe, expect, it } from 'vitest';
import { mapScraperValuation, type ScraperValuationSource } from './psxScraperProvider';

/** The card's fields, all null — what an unserved or empty payload must produce. */
const ALL_NULL = {
  peRatio: null,
  eps: null,
  bookValue: null,
  dividendYield: null,
  nextDividendDate: null,
  nextDividendAmount: null,
  beta: null,
};

/** EFERT as the payload serves it once #79 lands — the figures quoted in the issue. */
const EFERT: ScraperValuationSource = {
  ratios: { peRatio: 12.48, pbRatio: 5.95, dividendYield: 6.16, beta: 0.41 },
  financials: [{ eps: 15.94 }, { eps: 14.02 }],
  dividends: [
    { date: '2026-08-10', amount: 4.5 },
    { date: '2026-03-02', amount: 4.0 },
  ],
  bookValue: 33.51,
  nextDividendDate: '2026-08-10',
  nextDividendAmount: 4.5,
};

/** The payload shape *before* PSX_Scraper#83 (`GET /api/v1/stocks/EFERT`, quoted on
 *  2026-09-27): ratios filled — book value among them — the top-level dividend fields
 *  served, no top-level `bookValue`, `financials` empty, `beta` not computed. Kept because
 *  a feed that predates a field must still map: it is the fallback path's own fixture. */
const LIVE_EFERT_2026_09_27: ScraperValuationSource = {
  ratios: { peRatio: 12.48, pbRatio: 5.95, roe: 49.444, roa: 10.717, dividendYield: 6.16, bookValue: 32.842, beta: null },
  financials: [],
  dividends: [
    { announcementDate: '2026-08-10T00:00:00.000Z', bookClosure: null, paymentDate: null, dividend: 1.75 },
    { announcementDate: '2026-05-04T00:00:00.000Z', bookClosure: null, paymentDate: null, dividend: 2 },
  ],
  nextDividendDate: '2026-08-10T00:00:00.000Z',
  nextDividendAmount: 1.75,
};

/** EFERT as the feed answers once #83 landed — measured on the dev stack after a sync:
 *  `eps` served top-level (15.94, the figure the source's own page prints) as well as under
 *  `ratios`, `bookValue` likewise, and `financials` still empty. The card's EPS row reads the
 *  top-level figure; there is no financial row behind it. */
const LIVE_EFERT_AFTER_83: ScraperValuationSource = {
  ratios: {
    peRatio: 12.48, pbRatio: 5.95, roe: 49.444, roa: 10.717,
    dividendYield: 6.16, bookValue: 32.842, eps: 15.94, beta: null,
  },
  financials: [],
  dividends: [
    { announcementDate: '2026-08-10T00:00:00.000Z', bookClosure: null, paymentDate: null, dividend: 1.75 },
  ],
  bookValue: 32.842,
  eps: 15.94,
  nextDividendDate: '2026-08-10T00:00:00.000Z',
  nextDividendAmount: 1.75,
};

describe('mapScraperValuation', () => {
  it('maps the served book value and dividend fields into the card fields', () => {
    expect(mapScraperValuation(EFERT)).toEqual({
      peRatio: 12.48,
      eps: 15.94,
      bookValue: 33.51,
      dividendYield: 6.16,
      nextDividendDate: '2026-08-10',
      nextDividendAmount: 4.5,
      beta: 0.41,
    });
  });

  it('serves book value as a number — the row is no longer a hardcoded null', () => {
    expect(mapScraperValuation(EFERT).bookValue).toBe(33.51);
  });

  it('takes EPS from the newest financial row only', () => {
    expect(mapScraperValuation(EFERT).eps).toBe(15.94);
    expect(mapScraperValuation({ financials: [{}, { eps: 14.02 }] }).eps).toBeNull();
  });

  it('reads the dividend date and amount from the top-level fields when both are served', () => {
    const olderFeedSortedStale: ScraperValuationSource = {
      ...EFERT,
      // A feed whose array still starts at the previous dividend: the top-level fields
      // describe the newest one, and nothing older may leak into the rows.
      dividends: [{ date: '2026-03-02', amount: 4.0 }],
    };
    const mapped = mapScraperValuation(olderFeedSortedStale);
    expect(mapped.nextDividendDate).toBe('2026-08-10');
    expect(mapped.nextDividendAmount).toBe(4.5);
  });

  it('falls back to the newest dividend row for a feed that predates the top-level fields', () => {
    const olderFeed: ScraperValuationSource = {
      ratios: { peRatio: 12.48, pbRatio: null, dividendYield: null, beta: null },
      financials: [{ eps: 15.94 }],
      dividends: [
        { date: '2026-08-10', amount: 4.5 },
        { date: '2026-03-02', amount: 4.0 },
      ],
    };
    expect(mapScraperValuation(olderFeed)).toEqual({
      peRatio: 12.48,
      eps: 15.94,
      bookValue: null,
      dividendYield: null,
      nextDividendDate: '2026-08-10',
      nextDividendAmount: 4.5,
      beta: null,
    });
  });

  it('reads the newest dividend from the row keys the feed serves today when the top-level fields are absent', () => {
    const feedWithoutTopLevelDividendFields: ScraperValuationSource = {
      // The feed's dividend rows carry announcementDate/dividend; the second row is a
      // previous dividend and must not be consulted.
      dividends: [
        { announcementDate: '2026-08-10T00:00:00.000Z', dividend: 1.75 },
        { announcementDate: '2026-05-04T00:00:00.000Z', dividend: 2 },
      ],
    };
    const mapped = mapScraperValuation(feedWithoutTopLevelDividendFields);
    expect(mapped.nextDividendDate).toBe('2026-08-10T00:00:00.000Z');
    expect(mapped.nextDividendAmount).toBe(1.75);
  });

  it('reads the book value the feed serves today, under ratios, until the top-level field is served', () => {
    // EFERT as the dev feed answers on 2026-09-27: ratios filled (book value among
    // them), the top-level dividend fields served, no top-level bookValue yet.
    expect(mapScraperValuation(LIVE_EFERT_2026_09_27).bookValue).toBe(32.842);
  });

  it('reads the top-level EPS the feed serves, with no financial row to fall back on', () => {
    // The live shape after #83. The mapping used to read only `financials[0].eps`, so with
    // `financials` empty the row stayed a dash even once the feed was serving the figure.
    expect(mapScraperValuation(LIVE_EFERT_AFTER_83).eps).toBe(15.94);
  });

  it('keeps an EPS of exactly zero — break-even is a reading, not a dash', () => {
    // `?? null`, never `|| null`: a truthiness test would turn a served 0 into the dash, and a
    // zero EPS is a real figure for a company that broke even.
    expect(mapScraperValuation({ eps: 0 }).eps).toBe(0);
  });

  it('honours an explicit top-level null EPS over a financial row that predates it', () => {
    const sourcePublishesNone: ScraperValuationSource = {
      financials: [{ eps: 15.94 }],
      eps: null,
    };
    expect(mapScraperValuation(sourcePublishesNone).eps).toBeNull();
  });

  it('honours an explicit top-level null instead of the ratios copy — a figure is never carried forward', () => {
    const sourcePublishesNone: ScraperValuationSource = {
      ratios: { peRatio: null, pbRatio: null, dividendYield: null, bookValue: 32.842, beta: null },
      bookValue: null,
    };
    expect(mapScraperValuation(sourcePublishesNone).bookValue).toBeNull();
  });

  it('maps the live payload’s ratios, dividend date and amount into the card fields', () => {
    expect(mapScraperValuation(LIVE_EFERT_2026_09_27)).toEqual({
      peRatio: 12.48,
      eps: null,               // the payload's financials array is empty
      bookValue: 32.842,
      dividendYield: 6.16,
      nextDividendDate: '2026-08-10T00:00:00.000Z',
      nextDividendAmount: 1.75,
      beta: null,              // not computed for this symbol yet
    });
  });

  it('reports null, never 0, for every figure the feed publishes as nothing', () => {
    const nothingPublished: ScraperValuationSource = {
      ratios: { peRatio: null, pbRatio: null, dividendYield: null, beta: null },
      financials: [],
      dividends: [],
      bookValue: null,
      nextDividendDate: null,
      nextDividendAmount: null,
    };
    const mapped = mapScraperValuation(nothingPublished);
    expect(mapped).toEqual(ALL_NULL);
    // The card's dash depends on these being null, not on them being falsy: a 0 here
    // would print as a measured figure.
    expect(Object.values(mapped).every((v) => v === null)).toBe(true);
  });

  it('reports null for a payload that omits the fields entirely (a feed older than #79)', () => {
    // Today's live payload: ratios present but empty, no financials, no dividends, and
    // none of the three top-level fields.
    const todayLive: ScraperValuationSource = {
      ratios: { peRatio: null, pbRatio: null, dividendYield: null, beta: null },
      financials: [],
      dividends: [],
    };
    expect(mapScraperValuation(todayLive)).toEqual(ALL_NULL);
    expect(mapScraperValuation({})).toEqual(ALL_NULL);
    expect(mapScraperValuation({ ratios: null, financials: null, dividends: null })).toEqual(ALL_NULL);
  });

  it('passes a figure the feed publishes as 0 through as 0 — it only invents nothing, not zeroes', () => {
    const publishedZero: ScraperValuationSource = {
      ratios: { peRatio: null, pbRatio: null, dividendYield: 0, beta: null },
      dividends: [{ date: '2026-08-10', amount: 0 }],
      nextDividendAmount: 0,
    };
    const mapped = mapScraperValuation(publishedZero);
    expect(mapped.dividendYield).toBe(0);
    expect(mapped.nextDividendAmount).toBe(0);
    expect(mapped.peRatio).toBeNull();
    expect(mapped.bookValue).toBeNull();
  });

  it('returns only the card fields, so no ratio the card has no row for leaks in', () => {
    expect(Object.keys(mapScraperValuation(EFERT)).sort()).toEqual([
      'beta',
      'bookValue',
      'dividendYield',
      'eps',
      'nextDividendAmount',
      'nextDividendDate',
      'peRatio',
    ]);
  });
});
