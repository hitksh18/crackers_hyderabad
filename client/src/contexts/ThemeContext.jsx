import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'theme';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

/**
 * Storefront theme: DARK ONLY.
 *
 * The Crackers Hyderabad shop is a dark premium fireworks experience. There
 * is no light theme, no system-theme following, and no theme switching: the
 * `dark` class is always applied, a stale `localStorage` light choice is
 * discarded, and the OS/browser appearance has zero effect. The provider API
 * is kept (mounted by App.jsx) so no consumer or future import breaks, but
 * every path resolves to dark.
 * (Admin is a separate app with its own theme behaviour — untouched.)
 */
const applyDarkTheme = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('dark');
  root.style.colorScheme = 'dark';

  // Keep the mobile browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', '#14100E');

  // Discard an old stored preference (e.g. theme=light from a previous
  // build). Only this key is touched — cart, auth and app data are never
  // cleared here.
  try {
    if (localStorage.getItem(STORAGE_KEY) !== null) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // The preference simply will not persist if storage is unavailable.
  }
};

applyDarkTheme();

export const ThemeProvider = ({ children }) => {
  const [isDark] = useState(true);

  useEffect(() => {
    applyDarkTheme();
  }, []);

  /* Kept for API compatibility — dark is the only theme, so these pin it. */
  const setTheme = useCallback(() => {
    applyDarkTheme();
  }, []);

  const toggleTheme = useCallback(() => {
    applyDarkTheme();
  }, []);

  /** Already dark — just re-applies it. */
  const useSystemTheme = useCallback(() => {
    applyDarkTheme();
  }, []);

  const value = useMemo(
    () => ({
      isDark,
      theme: 'dark',
      /** The storefront never tracks the OS theme. */
      followsSystem: false,
      toggleTheme,
      setTheme,
      useSystemTheme,
    }),
    [isDark, toggleTheme, setTheme, useSystemTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
