import { useEffect, useState } from 'react';

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

const IDLE = { status: 'idle', data: null, error: null };

/**
 * Failures are classified so the UI can say what actually went wrong: a word
 * that does not exist and a network that never answered are very different
 * problems, and only one of them is the reader's spelling.
 */
const failure = (kind, message) => {
  const error = new Error(message);
  error.kind = kind;
  return error;
};

const describe = (error) => {
  if (error.kind) {
    return { kind: error.kind, message: error.message };
  }

  // fetch() rejects with a TypeError when the request never reached the server:
  // offline, DNS failure, blocked host, CORS. "Failed to fetch" means nothing
  // to a reader, so it never reaches the screen.
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return {
    kind: 'network',
    message: offline
      ? 'You appear to be offline'
      : 'Could not reach the dictionary',
    // A server that answers without CORS headers — an outage page, a rate limit —
    // is indistinguishable from an unreachable one here, so say both.
    detail: offline ? 'offline' : 'unreachable',
  };
};

/**
 * Fetches a word from the dictionary API.
 *
 * `request` is an object `{ term, nonce }` rather than a plain string so that
 * searching the same word twice still triggers a new request: the nonce changes
 * on every submit, which gives the effect a new dependency to react to. That
 * also makes retrying a failed request a matter of bumping the nonce.
 */
const useDictionary = (request) => {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    const term = request.term.trim();
    if (!term) {
      setState(IDLE);
      return undefined;
    }

    // Aborting on cleanup keeps a slow response from overwriting a newer one.
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });

    const fetchData = async () => {
      try {
        const url = `${API_URL}/${encodeURIComponent(term.toLowerCase())}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          throw response.status === 404
            ? failure('not-found', 'Word not found')
            : failure('service', 'The dictionary service is not responding');
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
          throw failure('format', 'This entry came back in an unexpected shape');
        }

        setState({
          status: 'success',
          data: { data, sourceUrls: data[0].sourceUrls },
          error: null,
        });
      } catch (error) {
        if (error.name === 'AbortError') return; // superseded by a newer search

        // The screen gets a readable message; the console keeps the real cause,
        // which is what you need when the API itself is the thing misbehaving.
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[dictionearch] lookup failed for "%s":', term, error);
        }

        setState({ status: 'error', data: null, error: describe(error) });
      }
    };

    fetchData();

    return () => controller.abort();
  }, [request]);

  return state;
};

export default useDictionary;
