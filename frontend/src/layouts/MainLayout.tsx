import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { BottomNav } from './BottomNav';
import { EnvBanner, ErrorBoundary } from '@/components/shared';
import { Toaster } from '@/components/ui/toaster';

export function MainLayout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    // Outer column: the dev-only banner sits above everything and flexbox gives it
    // its own height, so nothing below needs a hard-coded offset.
    // h-dvh rather than h-screen: 100vh is the *largest* viewport on mobile, so with
    // the browser chrome showing it pushes the bottom bar off-screen.
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Keyboard users land here first and can jump the three nav surfaces. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Gated at the call site so rollup drops the component AND its label string
          from a production bundle (`import.meta.env.DEV` is statically false there). */}
      {import.meta.env.DEV && <EnvBanner />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <MobileNav open={navOpen} onOpenChange={setNavOpen} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onOpenNav={() => setNavOpen(true)} />
          <main id="main" tabIndex={-1} className="flex-1 overflow-auto focus-visible:outline-none">
            <ErrorBoundary>
              {/* One content width for the whole app, so a 1920px screen does not
                  stretch a table to 1900px of mostly-empty rows. */}
              <div className="mx-auto w-full max-w-[1600px] p-4 motion-safe:animate-fade-in md:p-6 lg:p-8">
                <Outlet />
              </div>
            </ErrorBoundary>
          </main>
          {/* Last child of the column, not a fixed overlay: it takes its own height
              instead of covering the bottom of the content. */}
          <BottomNav />
        </div>
      </div>
      {/* Renders the notifications the app has always stored but never shown. */}
      <Toaster />
    </div>
  );
}
