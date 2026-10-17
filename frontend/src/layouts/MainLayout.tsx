import { useEffect, useRef, useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { BottomNav } from './BottomNav';
import { EnvBanner, ErrorBoundary } from '@/components/shared';
import { ScrollRootContext, ScrollProgress, PageTransition } from '@/components/animations';
import { Toaster } from '@/components/ui/toaster';

export function MainLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const outlet = useOutlet();

  // The app's only scroll container must return to the top on navigation —
  // otherwise a page change inherits the previous page's scroll depth.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <ScrollRootContext.Provider value={mainRef}>
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
          <div className="relative flex flex-1 flex-col overflow-hidden">
            {/* Tracks `<main>` scroll, so it must sit inside this column (not the
                document) and read the same container the content scrolls in. */}
            <ScrollProgress containerRef={mainRef} />
            <Header onOpenNav={() => setNavOpen(true)} />
            {/* `contain-paint` is load-bearing, not decoration — the same reason the
                holdings table carries it. It keeps overflow inside this scroller
                instead of sliding the whole shell (sidebar and header included). */}
            <main
              id="main"
              ref={mainRef}
              tabIndex={-1}
              className="contain-paint flex-1 overflow-auto focus-visible:outline-none"
            >
              <ErrorBoundary>
                {/* One content width for the whole app, so a 1920px screen does not
                    stretch a table to 1900px of mostly-empty rows. */}
                <div className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8">
                  {/* Route transition: keyed by pathname so each navigation
                      cross-fades the outgoing page out and the new one in. */}
                  <PageTransition>{outlet}</PageTransition>
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
    </ScrollRootContext.Provider>
  );
}
