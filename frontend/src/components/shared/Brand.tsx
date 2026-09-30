import { cn } from '@/lib/utils';
import { BRAND_NAME } from '@/constants';
import logoLight from '@/assets/brand/myportfolio365-logo.png';
import logoDark from '@/assets/brand/myportfolio365-logo-dark.png';

/** 32px: the height of the 64px brand rows the sidebar and the drawer both open with. */
const HEIGHT = 'h-8';

interface BrandProps {
  /** Bars and arrow alone — the one place the lockup cannot fit is the 64px collapsed rail. */
  mark?: boolean;
  className?: string;
}

/**
 * The logo: the top-left of the sidebar on desktop and of the drawer on phones. The app bar
 * deliberately carries none — see Header.
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
export function Brand({ mark = false, className }: BrandProps) {
  if (mark) {
    return <img src="/brand-mark.png" alt={BRAND_NAME} className={cn('w-auto shrink-0', HEIGHT, className)} />;
  }

  return (
    <>
      <img src={logoLight} alt={BRAND_NAME} className={cn('w-auto shrink-0 dark:hidden', HEIGHT, className)} />
      <img src={logoDark} alt="" aria-hidden="true" className={cn('hidden w-auto shrink-0 dark:block', HEIGHT, className)} />
    </>
  );
}
