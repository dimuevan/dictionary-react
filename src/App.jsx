import './App.css'; // Your main CSS file

import { useEffect, useState } from 'react';

import ErrorBoundary from './ErrorBoundary';
import Header from './Header';
import RecentWords from './RecentWords';
import ResultSkeleton from './ResultSkeleton';
import Search from './Search';
import WordDisplay from './WordDisplay';
import useDictionary from './useDictionary';
import usePreferences from './usePreferences';
import useSuggestions from './useSuggestions';
import useWordRequest from './useWordRequest';
import { wordOfTheDay } from './wordOfTheDay';

const savedAgo = (timestamp) => {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'a moment ago';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * What the reader sees in place of the result. Only 'not-found' is about the
 * word they typed; the rest are our problem, and retrying can fix them.
 */
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

/** A notice above an entry that is not quite the fresh, primary answer. */
const SourceNotice = ({ children, onRetry }) => (
  <div className="cache-notice">
    <p>{children}</p>
    <button type="button" className="retry-button" onClick={onRetry}>
      Try again
    </button>
  </div>
);

const App = () => {
  const { theme, toggleTheme, font, setFont } = usePreferences();
  const { request, search, changeLanguage, retry } = useWordRequest();
  const { status, data: wordData, error, cachedAt, source } = useDictionary(request);
  const suggestions = useSuggestions(error, request);

  const [showErrorClass, setShowErrorClass] = useState(false);
  const daily = wordOfTheDay();

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
  const classNames = `error-message${showErrorClass ? " showError" : ""}`;

  return (
    <div className="app">
      <Header
        onThemeToggle={toggleTheme}
        theme={theme}
        font={font}
        onFontChange={setFont}
        lang={request.lang}
        onLanguageChange={changeLanguage}
      />

      <div className='searchWrapper'>
        <Search onSearch={search} term={request.term} lang={request.lang} />

        {status === 'idle' && (
          <>
            <p className="placeholder-text">Enter a word to get started</p>
            <p className="daily">
              Word of the day:{' '}
              <button type="button" className="daily-word" onClick={() => search(daily)}>
                {daily}
              </button>
            </p>
            <RecentWords onSelect={search} />
          </>
        )}

        {status === 'loading' && <ResultSkeleton />}

        {status === 'success' && (
          <ErrorBoundary resetKey={request.nonce}>
            {cachedAt && error && (
              <SourceNotice onRetry={retry}>
                {error.message}, so this is the copy saved {savedAgo(cachedAt)}.
              </SourceNotice>
            )}
            {!cachedAt && source === 'wiktionary' && error && (
              <SourceNotice onRetry={retry}>
                {error.message}, so this comes straight from Wiktionary — which carries
                no pronunciation audio.
              </SourceNotice>
            )}
            <WordDisplay wordData={wordData} onSelectWord={search} lang={request.lang} />
          </ErrorBoundary>
        )}

        {status === 'error' && (
          <div className="search-failed">
            <p className="placeholder-text">{explanation.text}</p>
            {explanation.canRetry && (
              <button type="button" className="retry-button" onClick={retry}>
                Try again
              </button>
            )}
            {suggestions.length > 0 && (
              <nav className="suggestions" aria-label="Did you mean">
                <p className="suggestions-label">Did you mean</p>
                <ul className="suggestions-list">
                  {suggestions.map((word) => (
                    <li key={word}>
                      <button type="button" className="chip" onClick={() => search(word)}>
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
