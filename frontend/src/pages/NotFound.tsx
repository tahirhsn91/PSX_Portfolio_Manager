import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants';

/**
 * The 404 is routed inside MainLayout, so it is a page, not a dead end: the same
 * h1 scale as every other screen, one sentence saying what happened, and the
 * place a lost reader actually wants to be. No text-6xl number filling the
 * viewport, and no single low-contrast link out.
 */
export function NotFound() {
  const reduced = useReducedMotion();

  return (
    <div className="flex min-h-[50vh] items-center justify-center py-6">
      <motion.div
        initial={reduced ? false : { opacity: 0, scale: 0.9, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="w-full max-w-md rounded-xl border bg-card p-6 text-center text-card-foreground shadow-card sm:p-8"
      >
        <p
          aria-hidden="true"
          className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground tabular-nums"
        >
          404
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn’t exist — it may have been moved, or the address may be mistyped.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to={ROUTES.DASHBOARD}>
              <LayoutDashboard aria-hidden="true" />
              Go to dashboard
            </Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
