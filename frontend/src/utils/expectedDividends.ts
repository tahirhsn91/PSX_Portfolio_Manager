/**
 * Expected dividends: what the market has announced, multiplied by what you hold.
 *
 * Pure and framework-free on purpose — the totals on the Dividends page, the
 * portfolio subtotals and the dashboard card all read from this one function, so
 * they cannot disagree.
 *
 * Two rules keep it honest:
 *  - only the *announced* amount per share is used (never an estimate);
 *  - a holding whose symbol has no announcement is reported as uncovered, not
 *    quietly treated as zero.
 */
import type { DividendAnnouncement, Holding } from '@/types';

/** PSX withholding: 15% for a filer, 30% for a non-filer. */
export const WITHHOLDING_RATES = [15, 30] as const;
export type WithholdingRate = (typeof WITHHOLDING_RATES)[number];

/** A holding plus the portfolio it belongs to. */
export interface HoldingRef {
  portfolioId: string;
  portfolioName: string;
  holding: Holding;
}

export interface ExpectedDividendRow {
  /** Stable key: holding + announcement date + amount. */
  key: string;
  portfolioId: string;
  portfolioName: string;
  holdingId: string;
  symbol: string;
  companyName: string;
  shares: number;
  amountPerShare: number;
  announcementDate: string;
  exDate: string | null;
  paymentDate: string | null;
  gross: number;
  net: number;
  /** This one payout as a percentage of what the position cost. */
  yieldOnCost: number | null;
}

export interface PortfolioDividendGroup {
  portfolioId: string;
  portfolioName: string;
  rows: ExpectedDividendRow[];
  gross: number;
  net: number;
}

export interface ExpectedDividendSummary {
  rows: ExpectedDividendRow[];
  groups: PortfolioDividendGroup[];
  gross: number;
  net: number;
  /** Payouts counted (a symbol can have more than one announcement). */
  payouts: number;
  /** Distinct holdings with at least one announcement. */
  holdingsCovered: number;
  /** Symbols held with no announcement in the window — never counted as zero quietly. */
  holdingsWithout: string[];
  /** Earliest announcement date in the window, or null. */
  nextDate: string | null;
  rate: number;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function clampWithholdingRate(rate: number | undefined): number {
  if (!Number.isFinite(rate)) return WITHHOLDING_RATES[0];
  return Math.min(50, Math.max(0, rate as number));
}

/**
 * Multiply every announcement by the shares held in that symbol.
 *
 * `announcements` is expected to be already limited to the window the caller
 * wants (the ledger is queried with `from=today`), so this function never
 * decides which dates count as upcoming.
 */
export function summariseExpectedDividends(
  holdings: HoldingRef[],
  announcements: DividendAnnouncement[],
  withholdingRate: number = WITHHOLDING_RATES[0],
): ExpectedDividendSummary {
  const rate = clampWithholdingRate(withholdingRate);
  const keep = 1 - rate / 100;

  // One lookup pass: symbol → announcements, so a large portfolio does not
  // rescan the ledger once per holding.
  const bySymbol = new Map<string, DividendAnnouncement[]>();
  for (const announcement of announcements) {
    const symbol = announcement.symbol.toUpperCase();
    const list = bySymbol.get(symbol);
    if (list) list.push(announcement);
    else bySymbol.set(symbol, [announcement]);
  }

  const rows: ExpectedDividendRow[] = [];
  const without = new Set<string>();

  for (const { portfolioId, portfolioName, holding } of holdings) {
    if (!Number.isFinite(holding.shares) || holding.shares <= 0) continue;
    const symbol = holding.symbol.toUpperCase();
    const matched = bySymbol.get(symbol);
    if (!matched || matched.length === 0) {
      without.add(symbol);
      continue;
    }

    for (const announcement of matched) {
      const gross = round2(holding.shares * announcement.amountPerShare);
      const costBasis = holding.shares * holding.averagePurchasePrice;
      rows.push({
        key: `${holding.id}:${announcement.announcementDate}:${announcement.amountPerShare}`,
        portfolioId,
        portfolioName,
        holdingId: holding.id,
        symbol,
        companyName: holding.companyName || announcement.companyName,
        shares: holding.shares,
        amountPerShare: announcement.amountPerShare,
        announcementDate: announcement.announcementDate,
        exDate: announcement.exDate,
        paymentDate: announcement.paymentDate,
        gross,
        net: round2(gross * keep),
        yieldOnCost:
          costBasis > 0 ? round2((gross / costBasis) * 100) : null,
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.announcementDate.localeCompare(b.announcementDate) ||
      b.gross - a.gross ||
      a.symbol.localeCompare(b.symbol),
  );

  const groups: PortfolioDividendGroup[] = [];
  const groupIndex = new Map<string, PortfolioDividendGroup>();
  for (const row of rows) {
    let group = groupIndex.get(row.portfolioId);
    if (!group) {
      group = {
        portfolioId: row.portfolioId,
        portfolioName: row.portfolioName,
        rows: [],
        gross: 0,
        net: 0,
      };
      groupIndex.set(row.portfolioId, group);
      groups.push(group);
    }
    group.rows.push(row);
    group.gross = round2(group.gross + row.gross);
    group.net = round2(group.net + row.net);
  }

  return {
    rows,
    groups,
    gross: round2(rows.reduce((sum, row) => sum + row.gross, 0)),
    net: round2(rows.reduce((sum, row) => sum + row.net, 0)),
    payouts: rows.length,
    holdingsCovered: new Set(rows.map((row) => row.holdingId)).size,
    holdingsWithout: [...without].sort(),
    nextDate: rows[0]?.announcementDate ?? null,
    rate,
  };
}
