import './RecentWords.css';

import React, { useState } from 'react';
import { clearCachedWords, readRecentWords } from './wordCache';

/**
 * The words already looked up, offered on the empty screen. They come from the
 * same store that keeps entries readable when the dictionary is away, so
 * choosing one opens instantly.
 */
const RecentWords = ({ onSelect }) => {
  const [words, setWords] = useState(() => readRecentWords(10));

  if (!words.length) return null;

  const handleClear = () => {
    clearCachedWords();
    setWords([]);
  };

  return (
    <nav className="recent" aria-label="Recent words">
      <p className="recent-label">Recent</p>

      <ul className="recent-list">
        {words.map((word) => (
          <li key={word}>
            <button type="button" className="chip" onClick={() => onSelect(word)}>
              {word}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="recent-clear" onClick={handleClear}>
        Clear
      </button>
    </nav>
  );
};

export default RecentWords;
