import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './formatters';

/**
 * en-GB spells September "Sept" — four letters where the other eleven months use three —
 * so these pin the abbreviated form the app asks for, and the day-first order that comes
 * with it. Values are built without a Z so the assertions hold in whatever zone the suite
 * runs in.
 */
describe('formatDate', () => {
  it('abbreviates September to three letters', () => {
    expect(formatDate('2026-09-29', 'short')).toBe('29 Sep 2026');
    expect(formatDate('2026-09-29', 'short')).not.toContain('Sept');
  });

  it('leaves the other months and the day-first order alone', () => {
    expect(formatDate('2024-03-15', 'short')).toBe('15 Mar 2024');
    expect(formatDate('2026-07-04', 'short')).toBe('04 Jul 2026');
    expect(formatDate('2026-01-01', 'short')).toBe('01 Jan 2026');
  });

  it('still spells the month out when asked for long', () => {
    expect(formatDate('2026-09-29', 'long')).toBe('29 September 2026');
  });

  it('falls back rather than printing an invalid date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nonsense')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('puts a 12-hour clock beside the date, no space before the meridiem', () => {
    expect(formatDateTime(new Date('2026-09-29T21:30:00').toISOString())).toBe('29 Sep 2026, 9:30PM');
    expect(formatDateTime(new Date('2026-09-29T14:19:00').toISOString())).toBe('29 Sep 2026, 2:19PM');
    expect(formatDateTime(new Date('2026-09-29T09:05:00').toISOString())).toBe('29 Sep 2026, 9:05AM');
  });

  it('renders midnight as 12:19AM and noon as 12:00PM', () => {
    expect(formatDateTime(new Date('2026-09-29T00:19:00').toISOString())).toBe('29 Sep 2026, 12:19AM');
    expect(formatDateTime(new Date('2026-09-29T12:00:00').toISOString())).toBe('29 Sep 2026, 12:00PM');
  });

  it('takes the caller\'s word for what "no sign-in yet" reads as', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(null, 'never')).toBe('never');
    expect(formatDateTime('nonsense')).toBe('—');
  });
});
