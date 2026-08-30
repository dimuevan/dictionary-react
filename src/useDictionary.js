import { useEffect, useState } from 'react';

const API_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en';

const IDLE = { status: 'idle', data: null, error: null };

/**
 * Fetches a word from the dictionary API.
 *
 * `request` is an object `{ term, nonce }` rather than a plain string so that
 * searching the same word twice still triggers a new request: the nonce changes
 * on every submit, which gives the effect a new dependency to react to.
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
          throw new Error(response.status === 404 ? 'Word not found' : 'An error occurred');
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('Unexpected data format');
        }

        setState({
          status: 'success',
          data: { data, sourceUrls: data[0].sourceUrls },
          error: null,
        });
      } catch (error) {
        if (error.name === 'AbortError') return; // superseded by a newer search
        setState({ status: 'error', data: null, error: error.message });
      }
    };

    fetchData();

    return () => controller.abort();
  }, [request]);

  return state;
};

export default useDictionary;
