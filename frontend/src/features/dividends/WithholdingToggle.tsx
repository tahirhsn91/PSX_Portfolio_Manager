import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { WITHHOLDING_RATES } from '@/utils/expectedDividends';

/**
 * Filer / non-filer withholding switch. A segmented control rather than a select:
 * two options, both always visible, and the sliding pill makes the change legible
 * without re-reading the label.
 */
export function WithholdingToggle({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (rate: number) => void;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground" id="withholding-label">
        Withholding
      </span>
      <div
        role="radiogroup"
        aria-labelledby="withholding-label"
        className="inline-flex rounded-full border bg-muted/40 p-0.5"
      >
        {WITHHOLDING_RATES.map((option) => {
          const active = option === rate;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option)}
              className={cn(
                'relative h-9 min-w-[3.25rem] rounded-full px-3 text-xs font-medium tabular-nums transition-colors duration-fast ease-standard',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="withholding-pill"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full border bg-card shadow-sm"
                  transition={
                    reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                  }
                />
              )}
              <span className="relative">{option}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
