import { describe, expect, it } from 'vitest';
import {
  ACTIVE_CAP,
  MOVERS,
  changeTone,
  compactText,
  fromQuote,
  fromSarmaaya,
  levelText,
  pct,
  shortName,
} from './marketRows';
import type { SarmaayaRow, StockQuote } from '@/types';

const quote: StockQuote = {
  symbol: 'HBL',
  companyName: 'Habib Bank Limited',
  currentPrice: 172.5,
  change: 3.4,
  changePercent: 2.01,
  open: null,
  high: 174,
  low: 168,
  previousClose: 169.1,
  volume: 1_200_000,
  marketCap: null,
  sector: 'Commercial Banks',
  lastUpdated: '2026-01-05T11:00:00.000Z',
};

const row: SarmaayaRow = {
  symbol: 'OGDC',
  name: 'Oil & Gas Development Company Limited',
  price: null,
  change: -1,
  changePercent: -0.8,
  volume: null,
  isShariah: true,
  marketCap: 480_000_000_000,
};

describe('marketRows', () => {
  it('adapts a feed quote into the list shape', () => {
    expect(fromQuote(quote)).toEqual({
      symbol: 'HBL',
      name: 'Habib Bank Limited',
      price: 172.5,
      changePercent: 2.01,
      volume: 1_200_000,
      marketCap: null,
    });
  });

  it('adapts a sarmaaya row into the same shape', () => {
    expect(fromSarmaaya(row)).toEqual({
      symbol: 'OGDC',
      name: 'Oil & Gas Development Company Limited',
      price: null,
      changePercent: -0.8,
      volume: null,
      marketCap: 480_000_000_000,
    });
  });

  it('renders a missing figure as an em dash, never as 0', () => {
    expect(pct(null)).toBe('—');
    expect(pct(Number.NaN)).toBe('—');
    expect(levelText(null)).toBe('—');
    expect(compactText(undefined)).toBe('—');
    expect(pct(1.5)).toBe('+1.50%');
    expect(levelText(76998)).toBe('76,998');
  });

  it('tints a move by its direction, and a missing move as flat', () => {
    expect(changeTone(0.4)).toBe('text-profit');
    expect(changeTone(0)).toBe('text-profit');
    expect(changeTone(-1.2)).toBe('text-loss');
  });

  it('keeps a company name to a row\u2019s worth of words', () => {
    expect(shortName('Oil & Gas Development Company Limited')).toBe('Oil & Gas');
  });

  it('caps the traded list and the mover lists', () => {
    expect(ACTIVE_CAP).toBe(100);
    expect(MOVERS).toBe(5);
  });
});
