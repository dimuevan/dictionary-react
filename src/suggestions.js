const DATAMUSE_URL = 'https://api.datamuse.com/words';
const TIMEOUT_MS = 3000;
const MAX_SUGGESTIONS = 6;

/**
 * Words spelled like the one that was not found. Datamuse needs no key and its
 * `sp` parameter matches approximately, which is exactly what a typo needs.
 *
 * A misspelling should never become a second failure, so every problem here is
 * answered with an empty list: no suggestions simply means none are shown.
 */
export const fetchSuggestions = async (term) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${DATAMUSE_URL}?sp=${encodeURIComponent(term)}&max=${MAX_SUGGESTIONS + 2}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];

    const results = await response.json();
    if (!Array.isArray(results)) return [];

    return results
      .map((result) => (result && typeof result.word === 'string' ? result.word : ''))
      .filter((word) => word && word.toLowerCase() !== term.toLowerCase())
      .slice(0, MAX_SUGGESTIONS);
  } catch (error) {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

export default fetchSuggestions;
