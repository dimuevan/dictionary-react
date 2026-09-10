import './RecentWords.css';

import React, { useState } from 'react';
import { clearFavourites, readFavourites, removeFavourite, toCsv } from './favourites';
import { clearCachedWords, readCachedPayload, readRecentWords } from './wordCache';

import StudyCards from './StudyCards';
import { DEFAULT_LANGUAGE } from './languages';

const firstDefinition = (payload) => {
  const meanings = payload && payload.data && payload.data[0] && payload.data[0].meanings;
  const meaning = Array.isArray(meanings) ? meanings[0] : null;
  const definition = meaning && meaning.definitions && meaning.definitions[0];
  return definition ? definition.definition : '';
};

const downloadCsv = (entries) => {
  const csv = toCsv(entries, (entry) =>
    firstDefinition(readCachedPayload(entry.term, entry.lang))
  );

  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dictionearch-words.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    // downloads can be blocked; the collection is still on screen
  }
};

/**
 * What the empty screen offers: the words already looked up, the ones kept on
 * purpose, and a way to study them. All three read from storage that is already
 * there, so choosing anything opens instantly and works offline.
 */
const RecentWords = ({ onSelect }) => {
  const [tab, setTab] = useState('recent');
  const [recent, setRecent] = useState(() => readRecentWords(10));
  const [saved, setSaved] = useState(() => readFavourites());
  const [studying, setStudying] = useState(false);

  const entries = tab === 'recent' ? recent : saved;
  if (!recent.length && !saved.length) return null;

  if (studying) {
    return (
      <StudyCards
        entries={saved}
        onClose={() => setStudying(false)}
        onSelect={(term, lang) => onSelect(term, lang)}
      />
    );
  }

  const handleClear = () => {
    if (tab === 'recent') {
      clearCachedWords();
      setRecent([]);
    } else {
      clearFavourites();
      setSaved([]);
    }
  };

  const handleForget = (entry) => {
    removeFavourite(entry.term, entry.lang);
    setSaved(readFavourites());
  };

  return (
    <nav className="recent" aria-label="Your words">
      <div className="recent-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'recent'}
          className={`recent-tab ${tab === 'recent' ? 'is-active' : ''}`}
          onClick={() => setTab('recent')}
        >
          Recent
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'saved'}
          className={`recent-tab ${tab === 'saved' ? 'is-active' : ''}`}
          onClick={() => setTab('saved')}
        >
          Saved{saved.length ? ` (${saved.length})` : ''}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="recent-empty">
          {tab === 'saved'
            ? 'Star a word while reading it and it will wait for you here.'
            : 'Nothing looked up yet.'}
        </p>
      ) : (
        <ul className="recent-list">
          {entries.map((entry) => (
            <li key={`${entry.lang}:${entry.term}`}>
              <button
                type="button"
                className="chip"
                onClick={() => onSelect(entry.term, entry.lang)}
              >
                {entry.term}
                {entry.lang !== DEFAULT_LANGUAGE && (
                  <span className="chip-lang">{entry.lang}</span>
                )}
              </button>
              {tab === 'saved' && (
                <button
                  type="button"
                  className="chip-remove"
                  aria-label={`Remove ${entry.term}`}
                  onClick={() => handleForget(entry)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="recent-actions">
        {tab === 'saved' && saved.length > 0 && (
          <>
            <button type="button" className="recent-clear" onClick={() => setStudying(true)}>
              Study
            </button>
            <button type="button" className="recent-clear" onClick={() => downloadCsv(saved)}>
              Export CSV
            </button>
          </>
        )}
        {entries.length > 0 && (
          <button type="button" className="recent-clear" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>
    </nav>
  );
};

export default RecentWords;
