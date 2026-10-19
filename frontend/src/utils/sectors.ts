import { PSX_SECTORS, PSX_COMPANIES } from '@/constants';

/**
 * Sector normalisation.
 *
 * The scraper serves sectors in **PSX's own casing** — `FERTILIZER`,
 * `COMMERCIAL BANKS`, `POWER GENERATION & DISTRIBUTION` — while the picker
 * offers the curated Title Case list in `PSX_SECTORS`. Radix `Select` only
 * matches a value against `SelectItem`s exactly, so `CEMENT` never selected
 * `Cement`: the value was set on the form, but the field kept showing its
 * placeholder and the sector had to be chosen by hand.
 *
 * `normalizeSector` maps any incoming spelling onto a canonical `PSX_SECTORS`
 * entry (case- and whitespace-insensitive), and returns `null` when the value
 * is missing or can't be mapped — so callers can leave the field for the user
 * instead of writing a value the UI can't display.
 */

/** Placeholder values providers use when they have no sector for a symbol. */
const NO_SECTOR = new Set(['unknown', 'n/a', 'na', 'none', 'null', '-', '']);

const canonicalByKey = new Map(
  PSX_SECTORS.map((sector) => [sector.trim().toLowerCase().replace(/\s+/g, ' '), sector]),
);

export function normalizeSector(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (NO_SECTOR.has(key)) return null;

  return canonicalByKey.get(key) ?? null;
}

/** True when the value is already one of the canonical options. */
export function isCanonicalSector(value: string | null | undefined): boolean {
  return !!value && (PSX_SECTORS as readonly string[]).includes(value);
}

/**
 * Sector for a symbol from the app's curated list.
 *
 * Fallback for when the provider reports no sector (an older scraper build
 * whose `/search` omits the field, an untracked symbol, or Yahoo): the curated
 * list already knows the big names, so the field still fills itself instead of
 * making the user pick a sector they shouldn't have to.
 */
export function sectorForSymbol(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const wanted = symbol.trim().toUpperCase();
  const match = PSX_COMPANIES.find((company) => company.symbol.toUpperCase() === wanted);
  return match ? normalizeSector(match.sector) : null;
}

/**
 * Readable label for a sector that isn't in `PSX_SECTORS` (e.g. a newly listed
 * sector the curated list doesn't know yet): `TEXTILE SPINNING` → `Textile
 * Spinning`. Used so such a value can still be shown and kept, rather than
 * silently dropped or displayed as-is in SHOUTING CAPS.
 */
export function displaySector(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s|&)([a-z])/g, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

/**
 * Comparison key for a sector name: case-, punctuation- and `&`-insensitive.
 *
 * The market board names sectors short (`Oil & Gas Exploration`, `Technology`)
 * while a holding stores PSX's long form (`OIL & GAS EXPLORATION COMPANIES`,
 * `Technology & Communication`), so the two only line up once both sides are
 * reduced to this key.
 */
export function sectorKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a market sector refers to one of the sectors the holdings carry.
 *
 * Matched by containment in either direction — the board's short name sits
 * inside PSX's long name (`oil and gas exploration` ⊂ `oil and gas exploration
 * companies`) and vice versa — so no alias table is needed when either side
 * renames a sector.
 */
export function sectorMatchesAny(
  marketSector: string,
  holdingSectors: readonly string[],
): boolean {
  const key = sectorKey(marketSector);
  if (!key) return false;

  return holdingSectors.some((holdingSector) => {
    const held = sectorKey(holdingSector);
    return !!held && (held === key || held.includes(key) || key.includes(held));
  });
}

/**
 * Axis label for a sector.
 *
 * Eleven columns leave ~45px each, so the long PSX names are cut to two or three
 * short lines instead of being rotated. The full name stays in the tooltip and in
 * the summary under the chart, so nothing is lost by the abbreviation.
 */
const SECTOR_SHORT: Record<string, string> = {
  'OIL & GAS EXPLORATION COMPANIES': 'OIL & GAS EXPL.',
  'OIL & GAS MARKETING COMPANIES': 'OIL & GAS MKTG.',
  'POWER GENERATION & DISTRIBUTION': 'POWER GEN. & DIST.',
  'FOOD & PERSONAL CARE PRODUCTS': 'FOOD & CARE',
  'TECHNOLOGY & COMMUNICATION': 'TECH & COMM.',
  'REAL ESTATE INVESTMENT TRUST': 'REIT',
  'COMMERCIAL BANKS': 'COMM. BANKS',
};

/** Words that carry no weight on an axis, or that have an accepted short form. */
const SECTOR_WORDS: Record<string, string> = {
  COMPANIES: '',
  COMPANY: '',
  LIMITED: '',
  LTD: '',
  EXPLORATION: 'EXPL.',
  MARKETING: 'MKTG.',
  DISTRIBUTION: 'DIST.',
  GENERATION: 'GEN.',
  COMMUNICATION: 'COMM.',
  COMMERCIAL: 'COMM.',
  TECHNOLOGY: 'TECH.',
  AUTOMOBILE: 'AUTO',
  ASSEMBLER: 'ASM.',
  INVESTMENT: 'INV.',
  PERSONAL: 'PERS.',
  PRODUCTS: 'PROD.',
  FERTILIZER: 'FERT.',
  REFINERY: 'REFIN.',
  ENGINEERING: 'ENGR.',
  MANUFACTURING: 'MFG.',
  INTERNATIONAL: 'INTL.',
  INDUSTRIES: 'IND.',
  PHARMACEUTICALS: 'PHARMA',
  CHEMICALS: 'CHEM.',
  CONSTRUCTION: 'CONSTR.',
  INSURANCE: 'INS.',
  TEXTILE: 'TEXT.',
};

export function shortSectorName(name: string): string {
  const special = SECTOR_SHORT[name.toUpperCase()];
  if (special) return special;

  return name
    .split(/\s+/)
    .map((word) => {
      const key = word.replace(/[^A-Z]/gi, '').toUpperCase();
      if (key in SECTOR_WORDS) return SECTOR_WORDS[key];
      return word.length > 8 ? `${word.slice(0, 7)}.` : word;
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Three- or four-character axis code for a phone: eleven columns on a 330px card
 * leave ~26px each, where even `OIL & GAS EXPL.` runs into its neighbours. The
 * summary and the tooltip still carry the full name.
 */
const SECTOR_TINY: Record<string, string> = {
  'OIL & GAS EXPLORATION COMPANIES': 'OIL EXP',
  'OIL & GAS MARKETING COMPANIES': 'OIL MKT',
  'POWER GENERATION & DISTRIBUTION': 'PWR',
  'FOOD & PERSONAL CARE PRODUCTS': 'F&C',
  'TECHNOLOGY & COMMUNICATION': 'T&C',
  'REAL ESTATE INVESTMENT TRUST': 'REIT',
  'COMMERCIAL BANKS': 'BNK',
  REFINERY: 'REF',
  CEMENT: 'CEM',
  'AUTOMOBILE ASSEMBLER': 'AUT',
  FERTILIZER: 'FRT',
};

export function tinySectorName(name: string): string {
  const special = SECTOR_TINY[name.toUpperCase()];
  if (special) return special;
  return shortSectorName(name).replace(/\./g, '').split(/\s+/)[0]?.slice(0, 4) ?? '';
}
