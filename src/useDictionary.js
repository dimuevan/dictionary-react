import { readCachedWord, writeCachedWord } from './wordCache';
import { useEffect, useState } from 'react';

import { fetchWiktionary } from './wiktionary';

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

// A stalled request is worse than a failed one: the reader waits with nothing on
// screen. Cloudflare takes ~15s to admit a 522, so cap it well below that and
// move to the second source instead.
const PRIMARY_TIMEOUT_MS = 3500;
const FALLBACK_TIMEOUT_MS = 6000;

// Once the primary has failed, it is almost certainly still failing a few
// seconds later. Skipping it removes its timeout from every following search.
const PRIMARY_COOLDOWN_MS = 60000;
let primaryDownUntil = 0;

export const resetPrimaryBreaker = () => {
  primaryDownUntil = 0;
};

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

/** Worth a second source, and worth falling back to a saved copy for. */
const isTransient = (error) =>
  !error.kind || error.kind === 'network' || error.kind === 'service';

const describe = (error) => {
  if (error && error.kind) {
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

/**
 * Gives one request its own deadline while still obeying the search's own
 * cancellation. Callers check the outer signal to tell a timeout (try the next
 * source) from a superseded search (drop everything).
 */
const withDeadline = (outerSignal, ms) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const relay = () => controller.abort();

  if (outerSignal.aborted) controller.abort();
  else outerSignal.addEventListener('abort', relay, { once: true });

  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      outerSignal.removeEventListener('abort', relay);
    },
  };
};

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
 * Fetches a word, from the primary dictionary API when it is answering and from
 * Wiktionary when it is not.
 *
 * `request` is an object `{ term, nonce }` rather than a plain string so that
 * searching the same word twice still triggers a new request: the nonce changes
 * on every submit, which gives the effect a new dependency to react to. That
 * also makes retrying a failed request a matter of bumping the nonce.
 *
 * A saved copy of the word, if there is one, is shown immediately and replaced
 * when a fresh answer arrives — so a word you have seen before opens at once.
 * `cachedAt` is set only once the refresh has actually failed.
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
    const { signal } = controller;

    // Show what we already have straight away; the network then confirms or
    // corrects it, instead of the reader watching a skeleton for a word we hold.
    const cached = readCachedWord(term);
    setState(
      cached
        ? {
            status: 'success',
            data: cached.payload,
            error: null,
            cachedAt: null,
            source: 'primary',
          }
        : { status: 'loading', data: null, error: null, cachedAt: null, source: 'primary' }
    );

    // With `described`, the copy is shown under a notice explaining why it is
    // stale. Without it, the copy simply stands — nothing to explain.
    const keepCached = (described) => {
      if (!cached) return false;
      setState({
        status: 'success',
        data: cached.payload,
        error: described,
        cachedAt: described ? cached.savedAt : null,
        source: 'primary',
      });
      return true;
    };

    const run = async () => {
      let primaryError;

      if (Date.now() >= primaryDownUntil) {
        const deadline = withDeadline(signal, PRIMARY_TIMEOUT_MS);
        try {
          const payload = await requestWord(term, deadline.signal);
          writeCachedWord(term, payload);
          primaryDownUntil = 0;
          setState({
            status: 'success',
            data: payload,
            error: null,
            cachedAt: null,
            source: 'primary',
          });
          return;
        } catch (error) {
          if (signal.aborted) return; // superseded by a newer search
          primaryError = error;

          if (!isTransient(error)) {
            // A word that genuinely does not exist is an answer, not an outage —
            // unless we are refreshing a copy we already hold, which stays.
            if (!keepCached(null)) {
              setState({
                status: 'error',
                data: null,
                error: describe(error),
                cachedAt: null,
                source: 'primary',
              });
            }
            return;
          }

          primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
        } finally {
          deadline.release();
        }
      }

      if (process.env.NODE_ENV !== 'production' && primaryError) {
        console.warn('[dictionearch] primary lookup failed for "%s":', term, primaryError);
      }

      const described = describe(primaryError);

      // The primary API is a volunteer project that reads Wiktionary. When it is
      // unreachable, ask Wiktionary itself rather than give up.
      const deadline = withDeadline(signal, FALLBACK_TIMEOUT_MS);
      try {
        const fallback = await fetchWiktionary(term, deadline.signal);
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
        if (signal.aborted) return;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[dictionearch] wiktionary fallback failed:', fallbackError);
        }
      } finally {
        deadline.release();
      }

      // Both sources are away: a copy saved earlier still beats an empty screen.
      if (keepCached(described)) return;

      setState({
        status: 'error',
        data: null,
        error: described,
        cachedAt: null,
        source: 'primary',
      });
    };

    run();

    return () => controller.abort();
  }, [request]);

  return state;
};

export default useDictionary;
