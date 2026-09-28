import { createContext, useContext, useEffect, useMemo } from 'react';

/**
 * Crackers Hyderabad is DARK THEME ONLY. There is no light theme and no
 * theme switch anywhere in the UI.
 *
 * This module keeps the historical `useTheme()` / `ThemeProvider` API so
 * existing components keep working, but every value is pinned to dark:
 * - `isDark` is always true, `theme` is always 'dark'
 * - `toggleTheme`, `setTheme` and `useSystemTheme` are no-ops kept only so
 *   older call sites do not crash if any remain
 * - any legacy `theme` value left in localStorage by older builds is removed
 *   on boot so a stale "light" preference can never resurface
 */
const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const DARK_META_COLOR = '#14100E';

export const applyDarkTheme = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('dark');
  root.style.colorScheme = 'dark';

  // Keep the mobile browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', DARK_META_COLOR);

  // Drop legacy preferences from when a light theme existed. A stored
  // "light" value must never be able to bring the light UI back.
  try {
    localStorage.removeItem('theme');
    localStorage.removeItem('themeMode');
    localStorage.removeItem('darkMode');
    localStorage.removeItem('colorMode');
  } catch {
    // Storage unavailable — nothing to clean up.
  }
};

// Pin dark as early as module evaluation runs, before first render.
applyDarkTheme();

export const ThemeProvider = ({ children }) => {
  useEffect(() => {
    applyDarkTheme();
  }, []);

  const value = useMemo(
    () => ({
      isDark: true,
      theme: 'dark',
      /** The site no longer follows the OS — dark is permanent. */
      followsSystem: false,
      toggleTheme: () => {},
      setTheme: () => {},
      useSystemTheme: () => {},
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
