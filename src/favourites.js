import { DEFAULT_LANGUAGE } from './languages';

const FAVOURITES_KEY = 'dictionearch-favourites';

const keyFor = (term, lang) => `${lang}:${term}`;

/**
 * The history is passive — it keeps whatever you happened to look at. This
 * keeps what you decided to keep, which is what makes a collection worth
 * exporting and worth studying.
 */
const readAll = () => {
  try {
    const raw = window.localStorage.getItem(FAVOURITES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
};

const persist = (all) => {
  try {
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(all));
  } catch (error) {
    // out of quota or storage blocked; the starred word simply is not kept
  }
};

export const isFavourite = (term, lang = DEFAULT_LANGUAGE) =>
  Boolean(readAll()[keyFor(term, lang)]);

export const toggleFavourite = (term, lang = DEFAULT_LANGUAGE) => {
  const all = readAll();
  const key = keyFor(term, lang);

  if (all[key]) delete all[key];
  else all[key] = { term, lang, savedAt: Date.now() };

  persist(all);
  return Boolean(all[key]);
};

export const removeFavourite = (term, lang = DEFAULT_LANGUAGE) => {
  const all = readAll();
  delete all[keyFor(term, lang)];
  persist(all);
};

export const readFavourites = () => {
  const all = readAll();
  return Object.keys(all)
    .map((key) => all[key])
    .filter((entry) => entry && entry.term)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
};

export const clearFavourites = () => {
  try {
    window.localStorage.removeItem(FAVOURITES_KEY);
  } catch (error) {
    // nothing to do
  }
};

const escapeCell = (value) => {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * A collection you cannot take with you is not really yours. CSV opens in
 * every spreadsheet and imports into every flashcard app.
 */
export const toCsv = (entries, lookupDefinition) => {
  const rows = [['word', 'language', 'saved', 'definition']];

  entries.forEach((entry) => {
    rows.push([
      entry.term,
      entry.lang,
      new Date(entry.savedAt || Date.now()).toISOString().slice(0, 10),
      lookupDefinition ? lookupDefinition(entry) || '' : '',
    ]);
  });

  return rows.map((row) => row.map(escapeCell).join(',')).join('\n');
};

/**
 * Anki reads tab-separated fields: front, then back. Anyone studying seriously
 * is already in Anki, and this is a small step from the CSV we already build.
 */
export const toTsv = (entries, lookupDefinition) =>
  entries
    .map((entry) => {
      const back = lookupDefinition ? lookupDefinition(entry) || '' : '';
      const clean = (value) => String(value).replace(/[\t\r\n]+/g, ' ').trim();
      return `${clean(entry.term)}\t${clean(back)}`;
    })
    .join('\n');
