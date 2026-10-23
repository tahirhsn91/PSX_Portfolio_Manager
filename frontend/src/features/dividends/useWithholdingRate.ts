import { useCallback, useState } from 'react';
import { clampWithholdingRate, WITHHOLDING_RATES } from '@/utils/expectedDividends';

const STORAGE_KEY = 'pm.withholding-rate';

function readStoredRate(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return WITHHOLDING_RATES[0];
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampWithholdingRate(parsed) : WITHHOLDING_RATES[0];
  } catch {
    // Storage can be blocked (private mode, embedded webview) — the rate is a
    // preference, never a reason to break the page.
    return WITHHOLDING_RATES[0];
  }
}

/**
 * The withholding rate the user last chose. Persisted because it is a fact about
 * the *person* (filer or not), not about a page — it must not reset on reload.
 */
export function useWithholdingRate(): [number, (rate: number) => void] {
  const [rate, setRate] = useState(readStoredRate);

  const update = useCallback((next: number) => {
    const clamped = clampWithholdingRate(next);
    setRate(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      /* preference only */
    }
  }, []);

  return [rate, update];
}
