import { Outlet } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { EnvBanner } from '@/components/shared';
import { Toaster } from '@/components/ui/toaster';

/**
 * The shell for the signed-out pages. It mirrors MainLayout's outer column — same
 * `h-dvh` and the same DEV-gated banner — so the environment you are looking at is
 * as obvious on the sign-in page as it is inside the app. The banner is not
 * decoration: without it, a dev deployment is indistinguishable from production at
 * exactly the moment you are about to type a password into it.
 */
export function AuthLayout() {
  const reduced = useReducedMotion();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {import.meta.env.DEV && <EnvBanner />}
      <main className="flex flex-1 items-center justify-center overflow-auto p-4">
        {/* The sign-in card arrives with a spring — the app's one deliberate
            entrance on the signed-out shell, snapped to nothing under
            reduced motion. */}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.45, ease: [0.2, 0, 0, 1] }}
          className="w-full max-w-sm"
        >
          <Outlet />
        </motion.div>
      </main>
      <Toaster />
    </div>
  );
}
