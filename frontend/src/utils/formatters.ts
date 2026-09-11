/**
 * Formatting utilities — all display strings are produced here.
 * Keep formatting logic out of components.
 */

/**
 * Format a number as PKR currency
 * e.g. 1234567 → "PKR 12,34,567.00" or "₨ 1,234,567"
 */
export function formatCurrency(value: number, compact = false): string {
  if (isNaN(value) || !isFinite(value)) return 'PKR —';
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
export function formatCompactNumber(value: number): string {
  if (isNaN(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
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

    return new Intl.DateTimeFormat('en-PK', {
      day: '2-digit',
      month: format === 'long' ? 'long' : 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Format a volume number
 * e.g. 2500000 → "2.50M"
 */
export function formatVolume(value: number): string {
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
 * Format P&L value with color class
 */
export function getPLColorClass(value: number): string {
  if (value > 0) return 'text-profit';
  if (value < 0) return 'text-loss';
  return 'text-muted-foreground';
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
