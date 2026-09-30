/**
 * Formatting utilities — all display strings are produced here.
 * Keep formatting logic out of components.
 */

/**
 * Format a number as PKR currency
 * e.g. 1234567 → "PKR 12,34,567.00" or "₨ 1,234,567"
 */
export function formatCurrency(value: number | null | undefined, compact = false): string {
  // `value == null` catches null and undefined together: the feed omits fields
  // (market cap, volume) as null, and `isNaN(null)` is false — so without this a
  // missing figure printed as a real-looking PKR 0.00 / 0.
  if (value == null || isNaN(value) || !isFinite(value)) return 'PKR —';
  if (compact) {
    if (Math.abs(value) >= 1_000_000_000) return `PKR ${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `PKR ${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `PKR ${(value / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a percentage with sign
 * e.g. 12.34 → "+12.34%", -3.5 → "-3.50%"
 */
export function formatPercent(value: number, showSign = true): string {
  if (isNaN(value) || !isFinite(value)) return '—%';
  const formatted = `${Math.abs(value).toFixed(2)}%`;
  if (!showSign) return formatted;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Format a large number compactly
 * e.g. 1234567 → "1.23M"
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

/**
 * en-GB and every English locale beside en-US abbreviate September as "Sept" — four
 * letters where the other eleven months use three. Callers here want "Sep", and swapping
 * to en-US would flip the day and month around, so the month part is trimmed instead,
 * whatever the locale hands back.
 */
function dayMonthYear(date: Date, month: 'short' | 'long'): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month, year: 'numeric' })
    .formatToParts(date)
    .map((part) => (part.type === 'month' && month === 'short' ? part.value.slice(0, 3) : part.value))
    .join('');
}

/**
 * The clock, as "9:30PM": 12-hour, uppercase meridiem, no space in front of it.
 *
 * Arithmetic rather than Intl, because this runtime's ICU answers the 12-hour cycle with
 * 0 for both midnight and noon — it renders 00:19 as "0:19AM" and 12:00 as "0:00PM". It is
 * the same ICU that turns midnight into "24:19" under hour12: false.
 */
function clockTime(date: Date): string {
  const hours = date.getHours();
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(date.getMinutes()).padStart(2, '0')}${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * Format a date and the time of day
 * e.g. "2026-09-29T21:30:00" → "29 Sep 2026, 9:30PM"
 */
export function formatDateTime(value: string | null | undefined, empty = '—'): string {
  if (!value) return empty;
  const date = new Date(value);
  if (isNaN(date.getTime())) return empty;
  return `${dayMonthYear(date, 'short')}, ${clockTime(date)}`;
}

/**
 * Format a date string
 * e.g. "2024-03-15" → "15 Mar 2024"
 */
export function formatDate(dateStr: string | null | undefined, format: 'short' | 'long' | 'relative' = 'short'): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';

    if (format === 'relative') {
      const diff = Date.now() - date.getTime();
      const days = Math.floor(diff / 86_400_000);
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days} days ago`;
      if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
      if (days < 365) return `${Math.floor(days / 30)} months ago`;
      return `${Math.floor(days / 365)} years ago`;
    }

    return dayMonthYear(date, format === 'long' ? 'long' : 'short');
  } catch {
    return '—';
  }
}

/**
 * Format a volume number
 * e.g. 2500000 → "2.50M"
 */
export function formatVolume(value: number | null | undefined): string {
  return formatCompactNumber(value);
}

/**
 * Format a stock price (always 2 decimal places in PKR)
 */
export function formatPrice(value: number): string {
  if (isNaN(value)) return '—';
  return `PKR ${value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format confidence score to label
 */
export function formatConfidence(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

/**
 * Truncate a string to max length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}
