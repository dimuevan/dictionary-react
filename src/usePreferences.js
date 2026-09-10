import { useEffect, useState } from 'react';

const THEME_KEY = 'dictionearch-theme';
const FONT_KEY = 'dictionearch-font';
const FONTS = ['serif', 'sans', 'mono'];

const readStored = (key, allowed, fallback) => {
  try {
    const stored = window.localStorage.getItem(key);
    if (allowed.includes(stored)) return stored;
  } catch (error) {
    // localStorage can be unavailable (private mode, blocked cookies)
  }
  return fallback;
};

const initialTheme = () => {
  const stored = readStored(THEME_KEY, ['light', 'dark'], null);
  if (stored) return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Theme and typeface: both remembered, both applied through one class on the
 * body, which is what the CSS variables key off.
 */
const usePreferences = () => {
  const [theme, setTheme] = useState(initialTheme);
  const [font, setFont] = useState(() => readStored(FONT_KEY, FONTS, 'serif'));

  useEffect(() => {
    document.body.className = `${theme} font-${font}`;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
      window.localStorage.setItem(FONT_KEY, font);
    } catch (error) {
      // ignore write failures; both still apply for this session
    }
  }, [theme, font]);

  const toggleTheme = () => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  };

  return { theme, toggleTheme, font, setFont };
};

export default usePreferences;
