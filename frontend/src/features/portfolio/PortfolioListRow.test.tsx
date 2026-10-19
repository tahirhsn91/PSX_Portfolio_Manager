import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Portfolio, PortfolioMetrics } from '@/types';
import { PortfolioListRow } from './PortfolioListRow';

const portfolio = {
  id: 'p1',
  name: 'Long Term',
  color: '#00a651',
  holdings: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as unknown as Portfolio;

const metrics = {
  currentValue: 123_400,
  totalInvestment: 100_000,
  totalPL: 23_400,
  totalPLPercent: 23.4,
  todayPL: 1_200,
  todayPLPercent: 1.2,
} as unknown as PortfolioMetrics;

const noop = () => {};

describe('PortfolioListRow', () => {
  it('renders a link plus a separate actions menu, and the row figures', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ul>
          <PortfolioListRow
            portfolio={portfolio}
            metrics={metrics}
            onEdit={noop}
            onDelete={noop}
            onDuplicate={noop}
            onArchive={noop}
            onRestore={noop}
          />
        </ul>
      </MemoryRouter>,
    );

    expect(html).toContain('Open Long Term');
    expect(html).toContain('Actions for Long Term');
    expect(html).toContain('PKR 123.4K');
    expect(html).toContain('+23.40%');
    // The row is the dense view, so it must not render the card's "Today" strip.
    expect(html).not.toContain('rounded-md bg-muted/40 px-3 py-2');
  });
});
