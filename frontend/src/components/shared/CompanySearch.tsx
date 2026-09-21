import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCompanySearch } from '@/hooks';
import { PSX_COMPANIES } from '@/constants';
import type { PSXCompany } from '@/types';
import { cn } from '@/lib/utils';

interface CompanySearchProps {
  onSelect: (company: PSXCompany) => void;
  placeholder?: string;
  className?: string;
  /**
   * Options offered ahead of the searched companies — e.g. a benchmark index,
   * entered as a pseudo-company. They match the query by symbol or name, and are
   * all listed while the field is empty, so an index is pickable without typing.
   */
  extraOptions?: PSXCompany[];
}

export function CompanySearch({ onSelect, placeholder = 'Search company or ticker...', className, extraOptions }: CompanySearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // The input stays instant; only the *request* is debounced. 200 ms is below where typing
  // feels laggy, and it turns one request per keystroke into one per pause.
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isLoading } = useCompanySearch(searchTerm);

  /**
   * Matches straight from the bundle, rendered before the feed answers.
   *
   * The curated catalogue ships with the app, so a symbol it knows shows up instantly rather
   * than after the feed's search — which is ~10 ms once warm but seconds on a cold start.
   * These are a preview: the merged results replace them a moment later.
   */
  const localMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return PSX_COMPANIES
      .filter((c) => c.symbol.toLowerCase().includes(needle) || c.name.toLowerCase().includes(needle))
      .sort((a, b) =>
        Number(!a.symbol.toLowerCase().startsWith(needle)) - Number(!b.symbol.toLowerCase().startsWith(needle)))
      .slice(0, 6);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const extras = (extraOptions ?? []).filter(
      (c) => !needle
        || c.symbol.toLowerCase().includes(needle)
        || c.name.toLowerCase().includes(needle),
    );

    // Local matches first (instant), then the extras (the index list), then the feed's
    // results — deduped by symbol, since the three sources overlap heavily.
    const seen = new Set<string>();
    const merged: PSXCompany[] = [];
    for (const company of [...localMatches, ...extras, ...results]) {
      const key = company.symbol.toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(company);
    }

    // An exact ticker match always wins: typing "HBL" must offer the HBL stock above
    // HBLTTI Index.
    if (!needle) return merged;
    const isExact = (c: PSXCompany) => c.symbol.toLowerCase() === needle;
    return [...merged.filter(isExact), ...merged.filter((c) => !isExact(c))];
  }, [extraOptions, results, query, localMatches]);

  const handleSelect = (company: PSXCompany) => {
    onSelect(company);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && options.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">
          <ul className="max-h-64 overflow-auto py-1">
            {options.map((company) => (
              <li key={company.symbol}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleSelect(company)}
                >
                  <span className="inline-flex h-7 w-14 items-center justify-center rounded bg-primary/10 font-mono text-xs font-bold text-primary">
                    {company.symbol}
                  </span>
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{company.name}</span>
                    <span className="text-xs text-muted-foreground">{company.sector}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
