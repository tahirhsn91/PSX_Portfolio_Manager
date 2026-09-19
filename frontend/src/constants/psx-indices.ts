/**
 * PSX market indices.
 *
 * Codes are PSX's own (`dps.psx.com.pk` publishes exactly these in its index
 * carousel) and the labels are PSX's own wording, taken from the index list on
 * `psx.com.pk/market-summary`. Where PSX labels an index by its code alone, the
 * label follows that convention rather than inventing a name.
 *
 * The feed (PSX_Scraper) currently tracks KSE-100 only: `/api/v1/indices` reports
 * one index and any other code answers `404 Index not tracked`. The app therefore
 * offers the full list — so the section is complete the moment the feed tracks
 * more — and renders "not tracked yet" for the ones it cannot serve, rather than
 * a blank chart or a made-up number.
 */
export interface PSXIndex {
  /** PSX index code, as used in the feed's `/api/v1/indices/{code}` route. */
  code: string;
  /** PSX's own label for the index. */
  label: string;
}

export const PSX_INDICES: PSXIndex[] = [
  { code: 'KSE100', label: 'KSE 100 Index' },
  { code: 'KSE100PR', label: 'KSE100PR Index' },
  { code: 'ALLSHR', label: 'All Share Index' },
  { code: 'KSE30', label: 'KSE 30 Index' },
  { code: 'KMI30', label: 'KMI 30 Index' },
  { code: 'KMIALLSHR', label: 'PSX-KMI All Shares Index' },
  { code: 'PSXDIV20', label: 'PSX Dividend 20 Index' },
  { code: 'BKTI', label: 'BKTI Index' },
  { code: 'OGTI', label: 'OGTI Index' },
  { code: 'UPP9', label: 'UPP9 Index' },
  { code: 'NITPGI', label: 'NITPG Index' },
  { code: 'NBPPGI', label: 'NBPPGI Index' },
  { code: 'MZNPI', label: 'MZNPI Index' },
  { code: 'JSMFI', label: 'JSMF Index' },
  { code: 'ACI', label: 'ACIETF Index' },
  { code: 'JSGBKTI', label: 'JSGBKTI Index' },
  { code: 'HBLTTI', label: 'HBLTTI Index' },
  { code: 'MII30', label: 'MII30 Index' },
];

/** The headline index — the KPI cards' default and the comparison's starting point. */
export const DEFAULT_INDEX_CODE = 'KSE100';

export function findIndex(code: string): PSXIndex | undefined {
  const wanted = code.trim().toUpperCase();
  return PSX_INDICES.find((index) => index.code === wanted);
}

/** PSX's label for a code, falling back to the code itself. */
export function indexLabel(code: string): string {
  return findIndex(code)?.label ?? code;
}
