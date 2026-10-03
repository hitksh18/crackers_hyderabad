import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

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

const systemPrefersDark = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
};

/**
 * Resolve the theme exactly the way the inline script in index.html does:
 * an explicit choice wins, otherwise follow the operating system.
 */
const resolveInitial = () => {
  const stored = readStoredChoice();
  if (stored) return stored === 'dark';
  return systemPrefersDark();
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
  // Null means "no explicit choice yet — keep following the OS".
  const [choice, setChoice] = useState(readStoredChoice);

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  // Track the OS only until the visitor picks a side themselves.
  useEffect(() => {
    if (choice) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (event) => setIsDark(event.matches);

    setIsDark(mql.matches);

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }

    // Safari < 14 only has the deprecated listener API.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [choice]);

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

  /** Drop back to following the operating system. */
  const useSystemTheme = useCallback(() => {
    setChoice(null);
    setIsDark(systemPrefersDark());
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
