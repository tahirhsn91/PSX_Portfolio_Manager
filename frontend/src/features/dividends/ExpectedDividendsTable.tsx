import { formatDate, formatPkr, formatPrice } from '@/utils/formatters';
import type { ExpectedDividendRow, PortfolioDividendGroup } from '@/utils/expectedDividends';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Company({ row }: { row: ExpectedDividendRow }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="font-mono text-sm font-semibold">{row.symbol}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">{row.companyName}</span>
    </span>
  );
}

/**
 * Expected payouts, grouped by portfolio. A real table from `md` up (aligned
 * figures are what makes a payout list scannable); a two-line card per payout on
 * phones, where a seven-column table would only produce sideways scrolling.
 */
export function ExpectedDividendsTable({ groups }: { groups: PortfolioDividendGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.portfolioId}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <CardTitle className="text-base">{group.portfolioName}</CardTitle>
              <p className="text-sm">
                <span className="font-mono font-semibold tabular-nums">{formatPkr(group.gross)}</span>
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  net {formatPkr(group.net)}
                </span>
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-0 pb-1">
            {/* Desktop */}
            <table className="hidden w-full text-sm md:table" aria-label="Expected dividends">
              <caption className="sr-only">
                Expected dividends for {group.portfolioName}
              </caption>
              <thead>
                <tr className="border-y text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-left font-medium">Company</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Announced</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Per share</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Shares</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Gross</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Net</th>
                  <th scope="col" className="hidden px-4 py-2 text-right font-medium lg:table-cell">
                    On cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.key} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="w-[34%] px-4 py-2.5">
                      <Company row={row} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {formatDate(row.announcementDate)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatPrice(row.amountPerShare)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.shares.toLocaleString('en-PK')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {formatPkr(row.gross)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {formatPkr(row.net)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground lg:table-cell">
                      {row.yieldOnCost === null ? '—' : `${row.yieldOnCost.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phone */}
            <ul className="divide-y md:hidden">
              {group.rows.map((row) => (
                <li key={row.key} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold">{row.symbol}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {formatDate(row.announcementDate)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {formatPrice(row.amountPerShare)} × {row.shares.toLocaleString('en-PK')} shares
                      {row.yieldOnCost !== null && <> · {row.yieldOnCost.toFixed(2)}% of cost</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums">{formatPkr(row.gross)}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {formatPkr(row.net)} net
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
