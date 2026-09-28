import { useState, useRef, useEffect, useMemo, useId } from 'react';
import type { KeyboardEvent } from 'react';
import { Search, Loader2, AlertCircle, SearchX } from 'lucide-react';
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

/**
 * Company autocomplete.
 *
 * Built on the ARIA combobox pattern: the text input keeps focus and owns
 * role="combobox" / aria-expanded / aria-controls / aria-activedescendant, the
 * popup is a role="listbox" of role="option" rows, and ArrowUp / ArrowDown /
 * Home / End move the highlight while Enter picks it and Escape dismisses the
 * list. The highlight follows the pointer too, so mouse and keyboard can never
 * disagree about which row Enter will choose.
 *
 * The popup also says what it is doing: a status row while the feed is in flight,
 * a "no companies match" row when the query has no answers, and a warning row when
 * live search is unavailable (the saved matches are still offered underneath).
 *
 * Public props are unchanged — onSelect / placeholder / className / extraOptions —
 * so the market page, the add-holding form and the comparison selector that mount
 * this keep working exactly as they are.
 */
export function CompanySearch({ onSelect, placeholder = 'Search company or ticker...', className, extraOptions }: CompanySearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Three of these can be mounted at once (market, add-holding, the comparison
  // selector), so option ids must be unique per instance — a shared id would make
  // aria-activedescendant point into another instance's list.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  // The input stays instant; only the *request* is debounced. 200 ms is below where typing
  // feels laggy, and it turns one request per keystroke into one per pause.
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results = [], isLoading, isError, error } = useCompanySearch(searchTerm);

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

  // A new list invalidates the highlight the old one had: without this, Enter could
  // select whatever row happens to sit at the previous index in the new results.
  useEffect(() => {
    setActiveIndex(-1);
  }, [options]);

  // Keep the highlighted row visible while arrowing through a long list. jsdom has no
  // scrollIntoView, hence the optional call.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleSelect = (company: PSXCompany) => {
    onSelect(company);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Nothing to show and nothing highlighted yet: leave the caret to the text
      // field, which is what an editable combobox does when its list is empty.
      if (!open && options.length === 0) return;
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      setActiveIndex((current) => {
        if (event.key === 'ArrowDown') return current + 1 >= options.length ? 0 : current + 1;
        return current - 1 < 0 ? options.length - 1 : current - 1;
      });
      return;
    }

    if (open && (event.key === 'Home' || event.key === 'End') && options.length > 0) {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }

    if (event.key === 'Enter') {
      const company = open && activeIndex >= 0 ? options[activeIndex] : undefined;
      // Nothing highlighted → let Enter through, so it still submits an enclosing form.
      if (!company) return;
      event.preventDefault();
      handleSelect(company);
      return;
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Tab') setOpen(false);
  };

  const trimmed = query.trim();
  const hasResults = options.length > 0;
  const hasEmptyMessage = !hasResults && !isLoading && trimmed.length > 0;
  // The popup appears when it has something to say: results, a status line, or the
  // fact that nothing matched. An idle, empty field shows nothing, as before.
  const expanded = open && (hasResults || isLoading || isError || hasEmptyMessage);
  const activeOptionId =
    hasResults && activeIndex >= 0 && activeIndex < options.length ? optionId(activeIndex) : undefined;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          role="combobox"
          aria-expanded={expanded}
          aria-controls={hasResults ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-label={placeholder}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          // h-11: the input primitive ships at 40px, under the 44px touch minimum.
          className="h-11 pl-9"
        />
        {isLoading && (
          <Loader2
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </div>

      {expanded && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-overlay">
          {isLoading && (
            <p
              role="status"
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground',
                hasResults && 'border-b border-border'
              )}
            >
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin" />
              Searching PSX companies…
            </p>
          )}

          {isError && (
            <p
              role="alert"
              className={cn(
                'flex items-start gap-2 px-3 py-2.5 text-xs text-warning-dark',
                hasResults && 'border-b border-border'
              )}
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Live search is unavailable — showing the companies saved in this app.
                {error instanceof Error && error.message ? ` (${error.message})` : ''}
              </span>
            </p>
          )}

          {hasResults && (
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Company results"
              className="max-h-72 overflow-auto py-1"
            >
              {options.map((company, index) => {
                const active = index === activeIndex;
                return (
                  <li
                    key={company.symbol}
                    id={optionId(index)}
                    role="option"
                    aria-selected={active}
                    data-option-index={index}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                      active ? 'bg-accent text-accent-foreground' : 'text-foreground'
                    )}
                    // Focus stays in the input — that is what the combobox pattern
                    // requires, and it is where the keyboard handler lives.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => handleSelect(company)}
                  >
                    <span className="inline-flex h-7 w-14 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-xs font-bold text-primary">
                      {company.symbol}
                    </span>
                    <span className="flex min-w-0 flex-col text-left">
                      <span className="truncate font-medium">{company.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{company.sector}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {hasEmptyMessage && (
            <p className="flex items-start gap-2 px-3 py-3 text-xs text-muted-foreground">
              <SearchX aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No companies match “{trimmed}”. Check the ticker, or try the company’s name.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
