const DATAMUSE_URL = 'https://api.datamuse.com/words';
const TIMEOUT_MS = 3000;

/**
 * Datamuse needs no key and answers three different questions for us. It is
 * English-only, so every caller checks the language first.
 *
 * None of this is essential to reading a definition, so every failure here is
 * answered with nothing at all: a missing extra must never become an error the
 * reader has to deal with.
 */
const ask = async (params, extraSignal) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const relay = () => controller.abort();
  if (extraSignal) extraSignal.addEventListener('abort', relay, { once: true });

  try {
    const response = await fetch(`${DATAMUSE_URL}?${params}`, { signal: controller.signal });
    if (!response.ok) return [];

    const results = await response.json();
    return Array.isArray(results) ? results : [];
  } catch (error) {
    return [];
  } finally {
    clearTimeout(timer);
    if (extraSignal) extraSignal.removeEventListener('abort', relay);
  }
};

/** Words spelled like the one that was not found — what a typo needs. */
export const fetchSuggestions = async (term) => {
  const results = await ask(`sp=${encodeURIComponent(term)}&max=8`);

  return results
    .map((result) => (result && typeof result.word === 'string' ? result.word : ''))
    .filter((word) => word && word.toLowerCase() !== term.toLowerCase())
    .slice(0, 6);
};

/** Completions while typing, from the letters entered so far. */
export const fetchCompletions = async (prefix, signal) => {
  const results = await ask(`sp=${encodeURIComponent(prefix)}*&max=8`, signal);

  return results
    .map((result) => (result && typeof result.word === 'string' ? result.word : ''))
    .filter((word) => word && word.toLowerCase() !== prefix.toLowerCase() && !word.includes(' '))
    .slice(0, 6);
};

/**
 * Datamuse reports corpus frequency as a "f:<n>" tag — occurrences per million
 * words. Turning that into three plain words says something no definition does:
 * whether you can use the word without sounding odd.
 */
export const describeFrequency = (tags) => {
  if (!Array.isArray(tags)) return null;

  const tag = tags.find((entry) => typeof entry === 'string' && entry.startsWith('f:'));
  if (!tag) return null;

  const perMillion = Number.parseFloat(tag.slice(2));
  if (!Number.isFinite(perMillion)) return null;

  if (perMillion >= 10) return { label: 'common', perMillion };
  if (perMillion >= 0.5) return { label: 'uncommon', perMillion };
  return { label: 'rare', perMillion };
};

export const fetchFrequency = async (term, signal) => {
  const results = await ask(`sp=${encodeURIComponent(term)}&md=f&max=1`, signal);
  const exact = results.find(
    (result) => result && typeof result.word === 'string' &&
      result.word.toLowerCase() === term.toLowerCase()
  );

  return exact ? describeFrequency(exact.tags) : null;
};

const wordsFrom = (results, term, limit) =>
  results
    .map((result) => (result && typeof result.word === 'string' ? result.word : ''))
    .filter((word) => word && word.toLowerCase() !== term.toLowerCase())
    .slice(0, limit);

/**
 * Two more relationships the dictionary itself does not carry. They make an
 * entry useful to someone writing, not only to someone reading.
 */
export const fetchRelatedWords = async (term, signal) => {
  const [rhymes, meaningAlike] = await Promise.all([
    ask(`rel_rhy=${encodeURIComponent(term)}&max=10`, signal),
    ask(`ml=${encodeURIComponent(term)}&max=10`, signal),
  ]);

  return {
    rhymes: wordsFrom(rhymes, term, 8),
    similar: wordsFrom(meaningAlike, term, 8),
  };
};
