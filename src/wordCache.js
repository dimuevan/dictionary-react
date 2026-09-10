import { DEFAULT_LANGUAGE } from './languages';

const CACHE_KEY = 'dictionearch-words';
const MAX_ENTRIES = 50;

/** Entries are keyed by language and word, so "casa" in Spanish is its own. */
const keyFor = (term, lang = DEFAULT_LANGUAGE) => `${lang}:${term}`;

const parseKey = (key) => {
  const separator = key.indexOf(':');
  if (separator < 1) return null; // pre-language entries are simply ignored
  return { lang: key.slice(0, separator), term: key.slice(separator + 1) };
};

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

export const readCachedWord = (term, lang = DEFAULT_LANGUAGE) => {
  const entry = readAll()[keyFor(term, lang)];
  return entry && entry.payload ? entry : null;
};

export const writeCachedWord = (term, payload, lang = DEFAULT_LANGUAGE) => {
  try {
    const all = readAll();
    all[keyFor(term, lang)] = { savedAt: Date.now(), payload };

    // Drop the oldest entries rather than let the store grow without limit.
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => all[a].savedAt - all[b].savedAt)
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((stale) => delete all[stale]);
    }

    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (error) {
    // Not being able to remember a word is never worth failing a lookup over.
  }
};

/**
 * The words already saved, newest first. The cache doubles as the search
 * history: everything needed is already on disk, only nothing showed it.
 */
export const readRecentWords = (limit = 10) => {
  const all = readAll();

  return Object.keys(all)
    .map((key) => ({ key, parsed: parseKey(key) }))
    .filter(({ key, parsed }) => parsed && all[key] && all[key].payload)
    .sort((a, b) => (all[b.key].savedAt || 0) - (all[a.key].savedAt || 0))
    .slice(0, limit)
    .map(({ parsed }) => parsed);
};

/** The stored entry for a word, used to study it without the network. */
export const readCachedPayload = (term, lang = DEFAULT_LANGUAGE) => {
  const entry = readCachedWord(term, lang);
  return entry ? entry.payload : null;
};

/** Raw access, used only by backup and restore. */
export const readRawCache = () => readAll();

export const writeRawCache = (all) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (error) {
    // out of quota; nothing more to do
  }
};

export const CACHE_KEY_NAME = CACHE_KEY;

export const clearCachedWords = () => {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    // nothing to do; the history simply stays as it is
  }
};
