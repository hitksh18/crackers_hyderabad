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

const readStoredChoice = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
};

/** Storefront default: light. An explicit stored choice is honoured. */

/**
 * Storefront theme: explicitly LIGHT/WARM always.
 *
 * The Crackers Hyderabad shop is a light-brand experience (cream surfaces,
 * maroon festival accents) — it must never flip to the near-black `.dark`
 * palette just because the operating system is in dark mode. An explicit
 * stored choice is still honoured, but the OS is never followed.
 * (Admin is a separate app with its own theme behaviour — untouched.)
 */
const resolveInitial = () => {
  const stored = readStoredChoice();
  if (stored) return stored === 'dark';
  return false;
};

const applyTheme = (dark) => {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';

  // Keep the mobile browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', dark ? '#14100E' : '#761713');
};

const initialDark = resolveInitial();
applyTheme(initialDark);

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(initialDark);
  // Kept for API compatibility; nothing in the storefront reads it to
  // follow the OS anymore (see resolveInitial above).
  const [choice, setChoice] = useState(readStoredChoice);

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  const setTheme = useCallback((next) => {
    const dark = next === 'dark';
    setIsDark(dark);
    setChoice(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference simply will not persist if storage is unavailable.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  /** Reset to the storefront default (light brand palette). */
  const useSystemTheme = useCallback(() => {
    setChoice(null);
    setIsDark(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({
      isDark,
      theme: isDark ? 'dark' : 'light',
      /** True while the theme tracks the OS rather than an explicit pick. */
      followsSystem: choice === null,
      toggleTheme,
      setTheme,
      useSystemTheme,
    }),
    [isDark, choice, toggleTheme, setTheme, useSystemTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
