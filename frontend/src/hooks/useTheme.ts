import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

// Must match the key used in the inline script in index.html
const THEME_STORAGE_KEY = 'itp-theme';

function getInitialTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  if (current === 'light' || current === 'dark') return current;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // storage can be unavailable (private mode); the theme still works for this session
    }
    const setDisplayTheme = window.desktop?.window?.setDisplayTheme;
    if (setDisplayTheme) {
      void setDisplayTheme(theme).catch((error: unknown) => {
        console.error('[theme] Failed to update the secondary display theme', error);
      });
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
