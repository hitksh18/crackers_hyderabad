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
 * Storefront theme: WARM-LIGHT ONLY.
 *
 * The Crackers Hyderabad shop is a premium warm-light festive boutique
 * (ivory #FDF9F0 surfaces, maroon brand anchors, gold accents). There is no
 * dark theme, no system-theme following, and no theme switching: the `dark`
 * class is never applied, a stale stored choice is discarded, and the
 * OS/browser appearance has zero effect. The provider API is kept (mounted
 * by App.jsx) so no consumer or future import breaks, but every path
 * resolves to light.
 * (Admin is a separate app with its own theme behaviour — untouched.)
 */
const applyLightTheme = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark');
  root.style.colorScheme = 'light';

  // Keep the mobile browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', '#FDF9F0');

  // Discard an old stored preference (e.g. theme=dark from a previous
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

applyLightTheme();

export const ThemeProvider = ({ children }) => {
  const [isDark] = useState(false);

  useEffect(() => {
    applyLightTheme();
  }, []);

  /* Kept for API compatibility — light is the only theme, so these pin it. */
  const setTheme = useCallback(() => {
    applyLightTheme();
  }, []);

  const toggleTheme = useCallback(() => {
    applyLightTheme();
  }, []);

  /** Already light — just re-applies it. */
  const useSystemTheme = useCallback(() => {
    applyLightTheme();
  }, []);

  const value = useMemo(
    () => ({
      isDark,
      theme: 'light',
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
