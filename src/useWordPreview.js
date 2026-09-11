import { useEffect, useState } from 'react';

import { DEFAULT_LANGUAGE } from './languages';
import { fetchWiktionary } from './wiktionary';
import { readCachedWord } from './wordCache';
import { readExtra, writeExtra } from './extrasCache';

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries';
const TIMEOUT_MS = 3500;

/**
 * Enough of an entry to fill a card: the word, how it sounds, what part of
 * speech it is, and one definition.
 */
const summarise = (payload) => {
  const first = payload && payload.data && payload.data[0];
  if (!first) return null;

  const meaning = (first.meanings || [])[0];
  const definition = meaning && (meaning.definitions || [])[0];
  if (!definition) return null;

  const phonetic =
    (first.phonetics || []).map((entry) => entry.text).find(Boolean) || first.phonetic || '';

  return {
    word: first.word,
    phonetic,
    partOfSpeech: meaning.partOfSpeech || '',
    definition: definition.definition,
  };
};

/**
 * The word of the day, with its definition, for the card on the empty screen.
 *
 * Deliberately not `useDictionary`: that writes every success into the word
 * cache, and the word cache *is* the history. Showing the reader a word they
 * did not look up would put it in their recent words, which would be a lie
 * about what they had read.
 *
 * So: an entry already held is used as it stands; otherwise the summary alone
 * is fetched and kept beside the word in `extrasCache`, which is not the
 * history. Either way the card is filled without the network on the next visit.
 */
const useWordPreview = (term, lang = DEFAULT_LANGUAGE) => {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!term) return undefined;

    const held = readCachedWord(term, lang);
    if (held) {
      setPreview(summarise(held.payload));
      return undefined;
    }

    const remembered = readExtra(term, lang, 'preview');
    if (remembered) {
      setPreview(remembered);
      return undefined;
    }

    setPreview(null);

    // Nothing to gain from asking while offline, and a failed request there is
    // a console error the reader can see in their own devtools.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const ask = async () => {
      const attempt = async (fetcher) => {
        try {
          return await fetcher();
        } catch (error) {
          return null; // a card with no definition is not a failure
        }
      };

      let summary = await attempt(async () => {
        const response = await fetch(`${API_URL}/${lang}/${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return null;
        return summarise({ data: await response.json() });
      });

      if (!summary) {
        summary = await attempt(async () => {
          const fallback = await fetchWiktionary(term, lang, controller.signal);
          return fallback ? summarise(fallback) : null;
        });
      }

      if (controller.signal.aborted || !summary) return;
      setPreview(summary);
      writeExtra(term, lang, 'preview', summary);
    };

    ask();

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, lang]);

  return preview;
};

export default useWordPreview;
