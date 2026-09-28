import { Outlet } from 'react-router-dom';
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
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {import.meta.env.DEV && <EnvBanner />}
      <main className="flex flex-1 items-center justify-center overflow-auto p-4">
        <div className="w-full max-w-sm motion-safe:animate-fade-in">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
