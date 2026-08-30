const CACHE_KEY = 'dictionearch-words';
const MAX_ENTRIES = 50;

/**
 * Successful lookups are kept so a word you have already seen still opens when
 * the dictionary service is unreachable. Every access is guarded: localStorage
 * throws in private mode, when site data is blocked, and when the quota is full.
 */
const readAll = () => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
};

export const readCachedWord = (term) => {
  const entry = readAll()[term];
  return entry && entry.payload ? entry : null;
};

export const writeCachedWord = (term, payload) => {
  try {
    const all = readAll();
    all[term] = { savedAt: Date.now(), payload };

    // Drop the oldest entries rather than let the store grow without limit.
    const terms = Object.keys(all);
    if (terms.length > MAX_ENTRIES) {
      terms
        .sort((a, b) => all[a].savedAt - all[b].savedAt)
        .slice(0, terms.length - MAX_ENTRIES)
        .forEach((stale) => delete all[stale]);
    }

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (error) {
    // Not being able to remember a word is never worth failing a lookup over.
  }
};
