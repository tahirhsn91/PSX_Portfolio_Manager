import { useState, useRef, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCompanySearch } from '@/hooks';
import type { PSXCompany } from '@/types';
import { cn } from '@/lib/utils';

interface CompanySearchProps {
  onSelect: (company: PSXCompany) => void;
  placeholder?: string;
  className?: string;
}

export function CompanySearch({ onSelect, placeholder = 'Search company or ticker...', className }: CompanySearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: results = [], isLoading } = useCompanySearch(query);

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

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg">
          <ul className="max-h-64 overflow-auto py-1">
            {results.map((company) => (
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
