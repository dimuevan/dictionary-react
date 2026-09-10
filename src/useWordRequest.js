import { readRequestFromUrl, writeRequestToUrl } from './urlTerm';
import { useCallback, useEffect, useState } from 'react';

import { resetPrimaryBreaker } from './useDictionary';

/**
 * Which word is on screen, with the address bar as the source of truth. Every
 * change writes a history entry, so back and forward move between words instead
 * of leaving the app.
 *
 * The nonce changes on every submit so the same word can be searched twice, and
 * so a retry is just another request.
 */
const SITE_TITLE = 'Dictionearch by iamevandimu.com';

const useWordRequest = () => {
  const [request, setRequest] = useState(() => ({ ...readRequestFromUrl(), nonce: 0 }));

  // The title is the name of the bookmark and the entry in the history, and it
  // is what tells five open tabs apart. The word is already in the address; it
  // belongs here too.
  useEffect(() => {
    const term = request.term.trim();
    document.title = term ? `${term} — Dictionearch` : SITE_TITLE;
  }, [request.term]);

  useEffect(() => {
    const handlePopState = () => {
      setRequest((current) => ({ ...readRequestFromUrl(), nonce: current.nonce + 1 }));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const search = useCallback((query, lang) => {
    setRequest((current) => {
      const nextLang = lang || current.lang;
      writeRequestToUrl(query.trim(), nextLang);
      return { term: query, lang: nextLang, nonce: current.nonce + 1 };
    });
  }, []);

  // Changing language re-asks for the same word in the new dictionary.
  const changeLanguage = useCallback((nextLang) => {
    setRequest((current) => {
      writeRequestToUrl(current.term.trim(), nextLang);
      return { ...current, lang: nextLang, nonce: current.nonce + 1 };
    });
  }, []);

  // An explicit retry is also the moment to give the primary dictionary another
  // chance, cooldown or not.
  const retry = useCallback(() => {
    resetPrimaryBreaker();
    setRequest((current) => ({ ...current, nonce: current.nonce + 1 }));
  }, []);

  return { request, search, changeLanguage, retry };
};

export default useWordRequest;
