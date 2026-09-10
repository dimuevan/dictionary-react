import { DEFAULT_LANGUAGE, normalizeLanguage } from './languages';

const TERM_PARAM = 'w';
const LANG_PARAM = 'l';

/** The word and language the address bar is pointing at. */
export const readRequestFromUrl = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      term: params.get(TERM_PARAM) || '',
      lang: normalizeLanguage(params.get(LANG_PARAM)),
    };
  } catch (error) {
    return { term: '', lang: DEFAULT_LANGUAGE };
  }
};

/**
 * Puts the word in the address bar as a new history entry, so a definition can
 * be shared, bookmarked and reached again with the browser's back button.
 * Only the query string changes, which keeps the app working under the
 * subdirectory it is deployed to. English is the default and stays implicit,
 * so the common link remains just ?w=word.
 */
export const writeRequestToUrl = (term, lang = DEFAULT_LANGUAGE) => {
  try {
    const url = new URL(window.location.href);

    if (term) url.searchParams.set(TERM_PARAM, term);
    else url.searchParams.delete(TERM_PARAM);

    if (lang && lang !== DEFAULT_LANGUAGE) url.searchParams.set(LANG_PARAM, lang);
    else url.searchParams.delete(LANG_PARAM);

    if (url.href !== window.location.href) {
      window.history.pushState({ term, lang }, '', url);
    }
  } catch (error) {
    // history is unavailable in some embedded contexts; searching still works
  }
};

/** The shareable address of a word, for the copy-link control. */
export const shareUrlFor = (term, lang = DEFAULT_LANGUAGE) => {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(TERM_PARAM, term);
    if (lang && lang !== DEFAULT_LANGUAGE) url.searchParams.set(LANG_PARAM, lang);
    else url.searchParams.delete(LANG_PARAM);
    return url.href;
  } catch (error) {
    return '';
  }
};
