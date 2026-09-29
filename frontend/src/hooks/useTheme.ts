import { useEffect } from 'react';
import { useUIStore } from '@/store';

type Theme = 'light' | 'dark' | 'system';

/** Kept in step with the pre-paint bootstrap in index.html. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#F5F7FA',
  dark: '#0B1220',
};

/**
 * Paint a resolved theme onto <html>. `index.html` runs the same thing before
 * the first paint (so a dark-mode user never sees a white flash); this keeps it
 * true afterwards, when the setting changes from inside the app.
 */
function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Lets the browser theme its own furniture too: scrollbars, form controls, the
  // date picker the purchase form opens.
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved]);
}

export function useTheme() {
  const { settings, updateSettings } = useUIStore();
  const theme = settings.theme;

  useEffect(() => {
    if (theme === 'dark') {
      applyTheme('dark');
      return;
    }
    if (theme === 'light') {
      applyTheme('light');
      return;
    }

    // system: follow the OS, including while the app is open.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => updateSettings({ theme: t });

  return { theme, setTheme };
}
