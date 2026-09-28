/**
 * Importing a backup is a *restore*, so it has to be idempotent.
 *
 * The store used to append the file's portfolios to whatever was already saved
 * (`[...state.portfolios, ...portfolios]`), which made the documented way of
 * moving data between browsers — Settings → Export Backup, then Import Backup on
 * the other machine — duplicate everything that was already there. Import the
 * same file twice and every portfolio, holding and buy exists twice, with no way
 * to tell the copies apart.
 *
 * Portfolios carry their own `id`, so a row the file names by an id the store
 * already holds *is* that portfolio: replace it where it sits instead of adding a
 * second one. Identity is the id and nothing else — deliberately not the name,
 * which is user-chosen and may legitimately repeat.
 *
 * Kept pure and out of the store so the rule is testable without a browser: this
 * takes what is stored plus what the file carries, and reports what it did.
 */
import type { Portfolio } from '@/types';

export interface PortfolioImportResult {
  /** The list to store: existing rows in place, new ones appended in file order. */
  portfolios: Portfolio[];
  added: number;
  updated: number;
}

/** What an import did, for callers that only want to report it. */
export type PortfolioImportCounts = Pick<PortfolioImportResult, 'added' | 'updated'>;

export function mergeImportedPortfolios(
  existing: Portfolio[],
  incoming: Portfolio[],
): PortfolioImportResult {
  const merged = [...existing];
  const indexById = new Map<string, number>();
  merged.forEach((portfolio, index) => {
    if (portfolio?.id) indexById.set(portfolio.id, index);
  });

  let added = 0;
  let updated = 0;
  const seenInFile = new Set<string>();

  for (const portfolio of incoming) {
    if (!portfolio) continue;
    const id = portfolio.id;

    // A hand-edited file can carry an entry with no id at all. Nothing can be
    // matched against it, so the only honest thing to do is keep it — it will
    // duplicate on a second import of that file, which is the file's problem.
    if (!id) {
      merged.push(portfolio);
      added += 1;
      continue;
    }

    // The same id twice inside one file is one portfolio: the entry that comes
    // later wins, and it is counted once. Without this an import would still be
    // able to create a duplicate out of a single file.
    if (seenInFile.has(id)) {
      const at = indexById.get(id);
      if (at !== undefined) merged[at] = portfolio;
      continue;
    }
    seenInFile.add(id);

    const at = indexById.get(id);
    if (at === undefined) {
      // Not stored yet: append, keeping the file's order.
      indexById.set(id, merged.length);
      merged.push(portfolio);
      added += 1;
    } else {
      // Already stored: the file's copy refreshes that row where it sits, so
      // re-importing the same backup changes nothing instead of duplicating it.
      merged[at] = portfolio;
      updated += 1;
    }
  }

  return { portfolios: merged, added, updated };
}
