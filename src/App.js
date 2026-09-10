import './App.css'; // Your main CSS file

import React, { useEffect, useState } from 'react';

import { readRequestFromUrl, writeRequestToUrl } from './urlTerm';

import ErrorBoundary from './ErrorBoundary';
import Header from './Header';
import RecentWords from './RecentWords';
import ResultSkeleton from './ResultSkeleton';
import Search from './Search';
import WordDisplay from './WordDisplay';
import useDictionary, { resetPrimaryBreaker } from './useDictionary';
import { fetchSuggestions } from './datamuse';
import { DEFAULT_LANGUAGE } from './languages';
import { wordOfTheDay } from './wordOfTheDay';

const THEME_KEY = 'dictionearch-theme';
const FONT_KEY = 'dictionearch-font';
const FONTS = ['serif', 'sans', 'mono'];

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

/**
 * What the reader sees in place of the result. Only 'not-found' is about the
 * word they typed; the rest are our problem, and retrying can fix them.
 */
const getInitialFont = () => {
  try {
    const stored = window.localStorage.getItem(FONT_KEY);
    if (FONTS.includes(stored)) return stored;
  } catch (error) {
    // localStorage can be unavailable; the default face still applies
  }
  return 'serif';
};

const savedAgo = (timestamp) => {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'a moment ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const explain = (error, term) => {
  switch (error.kind) {
    case 'not-found':
      return {
        text: `No results for “${term}”. Check the spelling and try again.`,
        canRetry: false,
      };
    case 'service':
      return {
        text: 'The dictionary service is not responding right now.',
        canRetry: true,
      };
    case 'format':
      return {
        text: `“${term}” came back in a shape this app could not read.`,
        canRetry: true,
      };
    default:
      return {
        text:
          error.detail === 'offline'
            ? 'You appear to be offline. Reconnect and try again.'
            : 'Could not reach the dictionary. The service may be down, or something on the network is blocking the request — it is not your spelling.',
        canRetry: true,
      };
  }
};

const App = () => {
  const [theme, setTheme] = useState(getInitialTheme);
  const [font, setFont] = useState(getInitialFont);
  const [suggestions, setSuggestions] = useState([]);
  const daily = wordOfTheDay();
  // The address bar is the source of truth for which word is on screen.
  const [request, setRequest] = useState(() => ({ ...readRequestFromUrl(), nonce: 0 }));
  const [showErrorClass, setShowErrorClass] = useState(false);

  const { status, data: wordData, error, cachedAt, source } = useDictionary(request);

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  // A new nonce on every submit lets the same word be searched twice in a row.
  const handleSearch = (query, lang) => {
    setRequest((current) => {
      const nextLang = lang || current.lang;
      writeRequestToUrl(query.trim(), nextLang);
      return { term: query, lang: nextLang, nonce: current.nonce + 1 };
    });
  };

  // Changing language re-asks for the same word in the new dictionary.
  const handleLanguageChange = (nextLang) => {
    setRequest((current) => {
      writeRequestToUrl(current.term.trim(), nextLang);
      return { ...current, lang: nextLang, nonce: current.nonce + 1 };
    });
  };

  // Retrying is the same request with a fresh nonce. An explicit retry is also
  // the moment to give the primary dictionary another chance, cooldown or not.
  const handleRetry = () => {
    resetPrimaryBreaker();
    setRequest((current) => ({ ...current, nonce: current.nonce + 1 }));
  };

  // Back and forward move between words instead of leaving the app.
  useEffect(() => {
    const handlePopState = () => {
      setRequest((current) => ({ ...readRequestFromUrl(), nonce: current.nonce + 1 }));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Effect to apply class to body element
  useEffect(() => {
    document.body.className = `${theme} font-${font}`;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
      window.localStorage.setItem(FONT_KEY, font);
    } catch (storageError) {
      // ignore write failures; both still apply for this session
    }
  }, [theme, font]);

  // A misspelling should offer a way forward rather than a dead end.
  useEffect(() => {
    setSuggestions([]);
    if (!error || error.kind !== 'not-found' || request.lang !== DEFAULT_LANGUAGE) {
      return undefined;
    }

    let current = true;
    const term = request.term.trim();
    fetchSuggestions(term).then((words) => {
      if (current) setSuggestions(words);
    });

    return () => {
      current = false;
    };
  }, [error, request.term, request.lang, request.nonce]);

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

  const term = request.term.trim();
  const explanation = error ? explain(error, term) : null;

  // Determine the classnames dynamically
  const classNames = `error-message${showErrorClass ? " showError" : ""}`;

  return (
    <div className="app">
      <Header
        onThemeToggle={handleThemeToggle}
        theme={theme}
        font={font}
        onFontChange={setFont}
        lang={request.lang}
        onLanguageChange={handleLanguageChange}
      />
      <div className='searchWrapper'>
        <Search onSearch={handleSearch} term={request.term} lang={request.lang} />

        {status === 'idle' && (
          <>
            <p className="placeholder-text">Enter a word to get started</p>
            <p className="daily">
              Word of the day:{' '}
              <button type="button" className="daily-word" onClick={() => handleSearch(daily)}>
                {daily}
              </button>
            </p>
            <RecentWords onSelect={handleSearch} />
          </>
        )}
        {status === 'loading' && <ResultSkeleton />}
        {status === 'success' && (
          <ErrorBoundary resetKey={request.nonce}>
            {cachedAt && error && (
              <div className="cache-notice">
                <p>
                  {error.message}, so this is the copy saved {savedAgo(cachedAt)}.
                </p>
                <button type="button" className="retry-button" onClick={handleRetry}>
                  Try again
                </button>
              </div>
            )}
            {!cachedAt && source === 'wiktionary' && error && (
              <div className="cache-notice">
                <p>
                  {error.message}, so this comes straight from Wiktionary — which
                  carries no pronunciation audio.
                </p>
                <button type="button" className="retry-button" onClick={handleRetry}>
                  Try again
                </button>
              </div>
            )}
            <WordDisplay
              wordData={wordData}
              onSelectWord={handleSearch}
              lang={request.lang}
            />
          </ErrorBoundary>
        )}
        {status === 'error' && (
          <div className="search-failed">
            <p className="placeholder-text">{explanation.text}</p>
            {explanation.canRetry && (
              <button type="button" className="retry-button" onClick={handleRetry}>
                Try again
              </button>
            )}
            {suggestions.length > 0 && (
              <nav className="suggestions" aria-label="Did you mean">
                <p className="suggestions-label">Did you mean</p>
                <ul className="suggestions-list">
                  {suggestions.map((word) => (
                    <li key={word}>
                      <button type="button" className="chip" onClick={() => handleSearch(word)}>
                        {word}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        )}
      </div>

      {/* Always rendered so screen readers announce the message when it appears */}
      <p className={classNames} role="status" aria-live="polite">
        {error ? error.message : ''}
      </p>
    </div>
  );
};

export default App;
