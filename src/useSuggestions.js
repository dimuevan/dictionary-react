import { useEffect, useState } from 'react';

import { DEFAULT_LANGUAGE } from './languages';
import { fetchSuggestions } from './datamuse';

/**
 * Words spelled like one that was not found. Only for a genuine miss, only in
 * English (Datamuse speaks no other), and empty whenever the service is away.
 */
const useSuggestions = (error, request) => {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    setSuggestions([]);
    if (!error || error.kind !== 'not-found' || request.lang !== DEFAULT_LANGUAGE) {
      return undefined;
    }

    let current = true;
    fetchSuggestions(request.term.trim()).then((words) => {
      if (current) setSuggestions(words);
    });

    return () => {
      current = false;
    };
  }, [error, request.term, request.lang, request.nonce]);

  return suggestions;
};

export default useSuggestions;
