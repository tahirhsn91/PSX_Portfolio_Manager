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
