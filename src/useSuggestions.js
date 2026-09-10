import { useEffect, useState } from 'react';

import { DEFAULT_LANGUAGE } from './languages';
import { fetchSuggestions } from './datamuse';

// One shared empty list, so "no suggestions" compares equal to itself: React
// then skips a render that would change nothing on screen.
const NONE = [];

/**
 * Words spelled like one that was not found. Only for a genuine miss, only in
 * English (Datamuse speaks no other), and empty whenever the service is away.
 */
const useSuggestions = (error, request) => {
  const [suggestions, setSuggestions] = useState(NONE);

  useEffect(() => {
    setSuggestions(NONE);
    if (!error || error.kind !== 'not-found' || request.lang !== DEFAULT_LANGUAGE) {
      return undefined;
    }

    let current = true;
    fetchSuggestions(request.term.trim()).then((words) => {
      if (current && words.length) setSuggestions(words);
    });

    return () => {
      current = false;
    };
  }, [error, request.term, request.lang, request.nonce]);

  return suggestions;
};

export default useSuggestions;
