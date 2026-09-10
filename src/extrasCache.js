import { DEFAULT_LANGUAGE } from './languages';

const CACHE_KEY = 'dictionearch-extras';
const MAX_ENTRIES = 50;

// Where a word comes from does not change, and how common it is changes over
// years, not weeks. A month is generous and still not forever.
const MAX_AGE_MS = 30 * 86400000;

/**
 * The entry itself opens from `wordCache` instantly, and then the origin, the
 * frequency and the rhymes were fetched again from the network every single
 * time — which is exactly the part that is slow, and the part that is gone when
 * the network is.
 *
 * Only answers that carry something are kept. A Datamuse outage must not become
 * a month of remembered silence, so an empty answer is simply not written.
 */
const keyFor = (term, lang = DEFAULT_LANGUAGE) => `${lang}:${term}`;

const isEmpty = (value) => {
  if (value == null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.keys(value).every((key) => isEmpty(value[key]));
  }
  return false;
};

const readAll = () => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {}; // private mode, blocked site data, or something else's key
  }
};

const persist = (all) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (error) {
    // out of quota or storage blocked; the extras are simply fetched again
  }
};

/** The stored extra for one word, or null if it was never stored or has aged out. */
export const readExtra = (term, lang, field, now = Date.now()) => {
  const entry = readAll()[keyFor(term, lang)];
  if (!entry || now - (entry.savedAt || 0) > MAX_AGE_MS) return null;

  const value = entry[field];
  return isEmpty(value) ? null : value;
};

export const writeExtra = (term, lang, field, value, now = Date.now()) => {
  if (isEmpty(value)) return;

  const all = readAll();
  const key = keyFor(term, lang);
  all[key] = { ...(all[key] || {}), [field]: value, savedAt: now };

  // Drop the oldest rather than let the store grow without limit.
  const keys = Object.keys(all);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0))
      .slice(MAX_ENTRIES)
      .forEach((stale) => delete all[stale]);
  }

  persist(all);
};

export const clearExtras = () => {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    // nothing to do
  }
};

export { CACHE_KEY as EXTRAS_KEY, MAX_AGE_MS };
