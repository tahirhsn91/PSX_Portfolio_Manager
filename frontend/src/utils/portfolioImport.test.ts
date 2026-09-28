/**
 * Pins the rule an import follows: a backup restores, it does not accumulate.
 *
 * The regression this guards: importing the same backup twice used to append the
 * file's portfolios a second time, duplicating every portfolio, holding and buy.
 * Import/export is the supported way to move data between browsers, so a second
 * import is a normal thing for a user to do — and it must be a no-op.
 *
 * Pure, no browser: `localStorage` never enters into it.
 */

import { describe, expect, it } from 'vitest';
import { mergeImportedPortfolios } from './portfolioImport';
import type { Portfolio } from '@/types';

const portfolio = (id: string, name: string): Portfolio => ({
  id,
  name,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  color: '#4f46e5',
  holdings: [],
});

describe('mergeImportedPortfolios', () => {
  it('adds every portfolio of a first import, in the file’s order', () => {
    const result = mergeImportedPortfolios([], [portfolio('a', 'Alpha'), portfolio('b', 'Beta')]);

    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.portfolios.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('leaves the store untouched when the same backup is imported again', () => {
    const backup = [portfolio('a', 'Alpha'), portfolio('b', 'Beta')];
    const first = mergeImportedPortfolios([], backup);
    const second = mergeImportedPortfolios(first.portfolios, backup);

    // The bug: this used to be ['a', 'b', 'a', 'b'] — four rows, two of them copies.
    expect(second.portfolios.map((p) => p.id)).toEqual(['a', 'b']);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(2);
  });

  it('refreshes a changed portfolio in place and appends the rest', () => {
    const stored = [portfolio('a', 'Alpha'), portfolio('b', 'Beta')];
    const result = mergeImportedPortfolios(stored, [
      portfolio('b', 'Beta renamed'),
      portfolio('c', 'Gamma'),
    ]);

    expect(result.portfolios.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(result.portfolios[1].name).toBe('Beta renamed');
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
  });

  it('keeps stored portfolios that the file does not mention', () => {
    const stored = [portfolio('a', 'Alpha'), portfolio('b', 'Beta')];
    const result = mergeImportedPortfolios(stored, [portfolio('c', 'Gamma')]);

    expect(result.portfolios.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('collapses an id repeated inside a single file, to the last entry, counted once', () => {
    const result = mergeImportedPortfolios([], [
      portfolio('a', 'Alpha'),
      portfolio('a', 'Alpha corrected'),
      portfolio('b', 'Beta'),
    ]);

    expect(result.portfolios.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.portfolios[0].name).toBe('Alpha corrected');
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
  });

  it('does not confuse two portfolios that share a name', () => {
    const stored = [portfolio('a', 'Same name')];
    const result = mergeImportedPortfolios(stored, [portfolio('b', 'Same name')]);

    expect(result.portfolios.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.added).toBe(1);
  });

  it('keeps an entry that carries no id, since nothing can be matched to it', () => {
    const noId = { ...portfolio('', 'Hand-edited') };
    const result = mergeImportedPortfolios([], [noId]);

    expect(result.portfolios).toHaveLength(1);
    expect(result.added).toBe(1);
  });

  it('ignores null entries rather than storing them', () => {
    const result = mergeImportedPortfolios([], [null as unknown as Portfolio]);

    expect(result.portfolios).toEqual([]);
    expect(result.added).toBe(0);
  });
});
