import './App.css'; // Your main CSS file

import React, { useEffect, useState } from 'react';

import ErrorBoundary from './ErrorBoundary';
import Header from './Header';
import ResultSkeleton from './ResultSkeleton';
import Search from './Search';
import WordDisplay from './WordDisplay';
import useDictionary from './useDictionary';

const THEME_KEY = 'dictionearch-theme';

const getInitialTheme = () => {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch (error) {
    // localStorage can be unavailable (private mode, blocked cookies)
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const App = () => {
  const [theme, setTheme] = useState(getInitialTheme);
  const [request, setRequest] = useState({ term: '', nonce: 0 });
  const [showErrorClass, setShowErrorClass] = useState(false);

  const { status, data: wordData, error } = useDictionary(request);

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  // A new nonce on every submit lets the same word be searched twice in a row.
  const handleSearch = (query) => {
    setRequest((current) => ({ term: query, nonce: current.nonce + 1 }));
  };

  // Effect to apply class to body element
  useEffect(() => {
    document.body.className = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      // ignore write failures; the theme still applies for this session
    }
  }, [theme]);

  // Show the toast, then slide it away. Keyed on the nonce too, so two searches
  // that fail the same way still each get their own toast.
  useEffect(() => {
    if (!error) {
      setShowErrorClass(false);
      return undefined;
    }

    setShowErrorClass(true);
    const timer = setTimeout(() => setShowErrorClass(false), 3000);

    return () => clearTimeout(timer);
  }, [error, request.nonce]);

  // Determine the classnames dynamically
  const classNames = `error-message${showErrorClass ? " showError" : ""}`;

  return (
    <div className="app">
      <Header onThemeToggle={handleThemeToggle} theme={theme} />
      <div className='searchWrapper'>
        <Search onSearch={handleSearch} />

        {status === 'idle' && (
          <p className="placeholder-text">Enter a word to get started</p>
        )}
        {status === 'loading' && <ResultSkeleton />}
        {status === 'success' && (
          <ErrorBoundary resetKey={request.nonce}>
            <WordDisplay wordData={wordData} />
          </ErrorBoundary>
        )}
        {status === 'error' && (
          <p className="placeholder-text">
            No results for “{request.term.trim()}”. Check the spelling and try again.
          </p>
        )}
      </div>

      {/* Always rendered so screen readers announce the message when it appears */}
      <p className={classNames} role="status" aria-live="polite">{error || ''}</p>
    </div>
  );
};

export default App;
