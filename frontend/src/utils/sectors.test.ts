/**
 * Pins the match between the market sector board and a holding's sector.
 *
 * The board (`/api/yf/sectors`) names sectors short — "Oil & Gas Exploration",
 * "Power Generation", "Technology" — while the scraper writes PSX's long form
 * into a holding ("OIL & GAS EXPLORATION COMPANIES", "Power Generation &
 * Distribution", "Technology & Communication"). An exact comparison silently
 * drops every such sector, which is why the dashboard's board must match by
 * normalised containment rather than equality.
 */

import { describe, expect, it } from 'vitest';
import { sectorKey, sectorMatchesAny, shortSectorName, tinySectorName } from './sectors';

describe('sectorKey', () => {
  it('folds case, punctuation and ampersands', () => {
    expect(sectorKey('OIL & GAS EXPLORATION COMPANIES')).toBe('oil and gas exploration companies');
    expect(sectorKey('Oil & Gas Exploration')).toBe('oil and gas exploration');
    expect(sectorKey('  Power   Generation  ')).toBe('power generation');
  });
});

describe('sectorMatchesAny', () => {
  it('matches the board name against the long PSX name a holding carries', () => {
    expect(sectorMatchesAny('Oil & Gas Exploration', ['OIL & GAS EXPLORATION COMPANIES'])).toBe(true);
    expect(sectorMatchesAny('Oil & Gas Marketing', ['OIL & GAS MARKETING COMPANIES'])).toBe(true);
    expect(sectorMatchesAny('Power Generation', ['Power Generation & Distribution'])).toBe(true);
    expect(sectorMatchesAny('Technology', ['Technology & Communication'])).toBe(true);
  });

  it('matches across casing', () => {
    expect(sectorMatchesAny('Commercial Banks', ['COMMERCIAL BANKS'])).toBe(true);
    expect(sectorMatchesAny('Cement', ['CEMENT'])).toBe(true);
  });

  it('matches an exact name unchanged', () => {
    expect(sectorMatchesAny('Fertilizer', ['Fertilizer'])).toBe(true);
  });

  it('finds a holding among a list, not just the first', () => {
    expect(sectorMatchesAny('Cement', ['Fertilizer', 'Refinery', 'Cement'])).toBe(true);
  });

  it('does not match a sector the account does not hold', () => {
    expect(sectorMatchesAny('Textile', ['Fertilizer', 'Cement'])).toBe(false);
  });

  it('does not confuse two sectors that share a prefix', () => {
    expect(sectorMatchesAny('Oil & Gas Exploration', ['OIL & GAS MARKETING COMPANIES'])).toBe(false);
    expect(sectorMatchesAny('Oil & Gas Marketing', ['OIL & GAS EXPLORATION COMPANIES'])).toBe(false);
  });

  it('rejects an empty board name', () => {
    expect(sectorMatchesAny('', ['Cement'])).toBe(false);
    expect(sectorMatchesAny('   ', ['Cement'])).toBe(false);
  });
});

describe('shortSectorName', () => {
  it('uses the curated short form for the long PSX names on the axis', () => {
    expect(shortSectorName('OIL & GAS EXPLORATION COMPANIES')).toBe('OIL & GAS EXPL.');
    expect(shortSectorName('POWER GENERATION & DISTRIBUTION')).toBe('POWER GEN. & DIST.');
    expect(shortSectorName('REAL ESTATE INVESTMENT TRUST')).toBe('REIT');
    expect(shortSectorName('TECHNOLOGY & COMMUNICATION')).toBe('TECH & COMM.');
  });

  it('is case-insensitive about the curated names', () => {
    expect(shortSectorName('real estate investment trust')).toBe('REIT');
  });

  it('drops the company suffix and abbreviates the words it knows', () => {
    expect(shortSectorName('XYZ COMPANIES')).toBe('XYZ');
    expect(shortSectorName('PHARMACEUTICALS')).toBe('PHARMA');
  });

  it('leaves a short, unmapped name alone', () => {
    expect(shortSectorName('CEMENT')).toBe('CEMENT');
  });
});

describe('tinySectorName', () => {
  it('gives the long names a three- or four-character code for a phone', () => {
    expect(tinySectorName('OIL & GAS EXPLORATION COMPANIES')).toBe('OIL EXP');
    expect(tinySectorName('OIL & GAS MARKETING COMPANIES')).toBe('OIL MKT');
    expect(tinySectorName('REAL ESTATE INVESTMENT TRUST')).toBe('REIT');
    expect(tinySectorName('POWER GENERATION & DISTRIBUTION')).toBe('PWR');
    expect(tinySectorName('FOOD & PERSONAL CARE PRODUCTS')).toBe('F&C');
  });

  it('falls back to the first short word', () => {
    expect(tinySectorName('SUGAR & ALLIED INDUSTRIES')).toBe('SUGA');
  });
});
