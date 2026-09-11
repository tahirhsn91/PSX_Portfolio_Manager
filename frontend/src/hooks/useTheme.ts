import { useEffect } from 'react';
import { useUIStore } from '@/store';

export function useTheme() {
  const { settings, updateSettings } = useUIStore();
  const theme = settings.theme;

  useEffect(() => {
    const root = document.documentElement;
    const applyDark = () => root.classList.add('dark');
    const applyLight = () => root.classList.remove('dark');

    if (theme === 'dark') {
      applyDark();
    } else if (theme === 'light') {
      applyLight();
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.matches ? applyDark() : applyLight();
      const handler = (e: MediaQueryListEvent) => (e.matches ? applyDark() : applyLight());
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const setTheme = (t: 'light' | 'dark' | 'system') => updateSettings({ theme: t });

  return { theme, setTheme };
}
