import { CACHE_KEY_NAME, readRawCache, writeRawCache } from './wordCache';

const FAVOURITES_KEY = 'dictionearch-favourites';
const SCHEDULE_KEY = 'dictionearch-study';
const FORMAT = 'dictionearch-backup';
const VERSION = 1;

const readKey = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
};

const writeKey = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // out of quota; the rest of the restore still applies
  }
};

/**
 * Everything lives in this browser's localStorage, so changing device loses the
 * lot. A file is the honest answer without a server: exported here, read back
 * below, and merged rather than replacing what is already on the machine.
 */
export const buildBackup = () => ({
  format: FORMAT,
  version: VERSION,
  exportedAt: new Date().toISOString(),
  words: readRawCache(),
  favourites: readKey(FAVOURITES_KEY),
  study: readKey(SCHEDULE_KEY),
});

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Returns how many entries were taken, or null when the file is not one of ours.
 * Newer saves win over older ones for the same word.
 */
export const restoreBackup = (payload) => {
  if (!isPlainObject(payload) || payload.format !== FORMAT) return null;

  const mergeInto = (key, incoming, existing) => {
    if (!isPlainObject(incoming)) return 0;

    const merged = { ...existing };
    let taken = 0;

    Object.keys(incoming).forEach((entryKey) => {
      const candidate = incoming[entryKey];
      if (!isPlainObject(candidate)) return;

      const current = merged[entryKey];
      if (!current || (candidate.savedAt || 0) >= (current.savedAt || 0)) {
        merged[entryKey] = candidate;
        taken += 1;
      }
    });

    if (key === 'words') writeRawCache(merged);
    else writeKey(key === 'favourites' ? FAVOURITES_KEY : SCHEDULE_KEY, merged);

    return taken;
  };

  return {
    words: mergeInto('words', payload.words, readRawCache()),
    favourites: mergeInto('favourites', payload.favourites, readKey(FAVOURITES_KEY)),
    study: mergeInto('study', payload.study, readKey(SCHEDULE_KEY)),
  };
};

export { FORMAT, CACHE_KEY_NAME };
