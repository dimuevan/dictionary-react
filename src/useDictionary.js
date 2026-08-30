import { readCachedWord, writeCachedWord } from './wordCache';
import { useEffect, useState } from 'react';

import { fetchWiktionary } from './wiktionary';

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

// A Cloudflare 522 in front of this API is common and usually gone a moment
// later, so one quiet retry saves most of them before the reader sees anything.
const RETRY_DELAY_MS = 800;
const MAX_ATTEMPTS = 2;

const IDLE = { status: 'idle', data: null, error: null, cachedAt: null, source: 'primary' };

/**
 * Failures carry a kind so the UI can say what actually went wrong: a word that
 * does not exist and a service that never answered are different problems, and
 * only one of them is the reader's spelling.
 */
const failure = (kind, message) => {
  const error = new Error(message);
  error.kind = kind;
  return error;
};

/** Worth another attempt, and worth falling back to a saved copy for. */
const isTransient = (error) =>
  !error.kind || error.kind === 'network' || error.kind === 'service';

const describe = (error) => {
  if (error.kind) {
    return { kind: error.kind, message: error.message };
  }

  // fetch() rejects with a TypeError when the request never reached the server:
  // offline, DNS failure, blocked host, or a response with no CORS headers —
  // which is exactly what a Cloudflare error page is. "Failed to fetch" means
  // nothing to a reader, so it never reaches the screen.
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return {
    kind: 'network',
    message: offline ? 'You appear to be offline' : 'Could not reach the dictionary',
    detail: offline ? 'offline' : 'unreachable',
  };
};

const abortError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true }
    );
  });

const requestWord = async (term, signal) => {
  const response = await fetch(`${API_URL}/${encodeURIComponent(term)}`, { signal });

  if (!response.ok) {
    throw response.status === 404
      ? failure('not-found', 'Word not found')
      : failure('service', 'The dictionary service is not responding');
  }

  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw failure('format', 'This entry came back in an unexpected shape');
  }

  return { data, sourceUrls: data[0].sourceUrls };
};

/**
 * Fetches a word from the dictionary API.
 *
 * `request` is an object `{ term, nonce }` rather than a plain string so that
 * searching the same word twice still triggers a new request: the nonce changes
 * on every submit, which gives the effect a new dependency to react to. That
 * also makes retrying a failed request a matter of bumping the nonce.
 *
 * Returns `cachedAt` when the service could not be reached and a previously
 * saved copy of the word is being shown instead.
 */
const useDictionary = (request) => {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    const term = request.term.trim().toLowerCase();
    if (!term) {
      setState(IDLE);
      return undefined;
    }

    // Aborting on cleanup keeps a slow response from overwriting a newer one.
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null, cachedAt: null, source: 'primary' });

    const run = async () => {
      let lastError;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const payload = await requestWord(term, controller.signal);
          writeCachedWord(term, payload);
          setState({
            status: 'success',
            data: payload,
            error: null,
            cachedAt: null,
            source: 'primary',
          });
          return;
        } catch (error) {
          if (error.name === 'AbortError') return; // superseded by a newer search
          lastError = error;

          if (!isTransient(error) || attempt === MAX_ATTEMPTS) break;

          try {
            await wait(RETRY_DELAY_MS, controller.signal);
          } catch (aborted) {
            return;
          }
        }
      }

      // The screen gets a readable message; the console keeps the real cause,
      // which is what you need when the API itself is the thing misbehaving.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[dictionearch] lookup failed for "%s":', term, lastError);
      }

      const described = describe(lastError);

      // A word that genuinely does not exist is an answer, not an outage: no
      // second source, no saved copy, no retry.
      if (!isTransient(described)) {
        setState({ status: 'error', data: null, error: described, cachedAt: null, source: 'primary' });
        return;
      }

      // The primary API is a volunteer project that reads Wiktionary. When it is
      // unreachable, ask Wiktionary itself rather than give up.
      try {
        const fallback = await fetchWiktionary(term, controller.signal);
        if (fallback) {
          writeCachedWord(term, fallback);
          setState({
            status: 'success',
            data: fallback,
            error: described,
            cachedAt: null,
            source: 'wiktionary',
          });
          return;
        }
      } catch (fallbackError) {
        if (fallbackError.name === 'AbortError') return;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[dictionearch] wiktionary fallback failed:', fallbackError);
        }
      }

      // Both sources are away: a copy saved earlier still beats an empty screen.
      const cached = readCachedWord(term);
      if (cached) {
        setState({
          status: 'success',
          data: cached.payload,
          error: described,
          cachedAt: cached.savedAt,
          source: 'primary',
        });
        return;
      }

      setState({ status: 'error', data: null, error: described, cachedAt: null, source: 'primary' });
    };

    run();

    return () => controller.abort();
  }, [request]);

  return state;
};

export default useDictionary;
