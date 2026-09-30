import { cn } from '@/lib/utils';
import { BRAND_NAME } from '@/constants';
import logoLight from '@/assets/brand/myportfolio365-logo.png';
import logoDark from '@/assets/brand/myportfolio365-logo-dark.png';

/** Artwork heights. `sm` is the phone header, `md` the sidebar and the drawer. */
const SIZE = { sm: 'h-6', md: 'h-8', lg: 'h-9' } as const;

interface BrandProps {
  size?: keyof typeof SIZE;
  /** Bars and arrow alone — the one place the lockup cannot fit is the 64px collapsed rail. */
  mark?: boolean;
  className?: string;
}

/**
 * The logo: the sidebar's top-left on desktop, the header's on phones.
 *
 * Two files rather than one because the artwork is drawn for white paper. Its wordmark is
 * #3A3A3A and its green bars #1E523B, which measure 1.2:1 and 1.9:1 against the dark
 * surface — invisible. The dark twin lifts exactly those two inks to the palette's `text`
 * and `up.main` and leaves the gold as drawn (it is 11.8:1 on either surface). Both files
 * are PNGs with alpha, not the JPEG on white they arrived as: a JPEG would paint a white
 * box behind the logo on every surface that is not white.
 *
 * The name is announced once. The dark twin is `aria-hidden`, so a screen reader hears the
 * brand and not the brand twice.
 */
export function Brand({ size = 'md', mark = false, className }: BrandProps) {
  const height = SIZE[size];

  if (mark) {
    return <img src="/brand-mark.png" alt={BRAND_NAME} className={cn('w-auto shrink-0', height, className)} />;
  }

  return (
    <>
      <img src={logoLight} alt={BRAND_NAME} className={cn('w-auto shrink-0 dark:hidden', height, className)} />
      <img src={logoDark} alt="" aria-hidden="true" className={cn('hidden w-auto shrink-0 dark:block', height, className)} />
    </>
  );
}
