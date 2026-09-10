const PARAM = 'w';

/** The word the address bar is pointing at, if any. */
export const readTermFromUrl = () => {
  try {
    return new URLSearchParams(window.location.search).get(PARAM) || '';
  } catch (error) {
    return '';
  }
};

/**
 * Puts the word in the address bar as a new history entry, so a definition can
 * be shared, bookmarked and reached again with the browser's back button.
 * Only the query string changes, which keeps the app working under the
 * subdirectory it is deployed to.
 */
export const writeTermToUrl = (term) => {
  try {
    const url = new URL(window.location.href);
    if (term) url.searchParams.set(PARAM, term);
    else url.searchParams.delete(PARAM);

    if (url.href !== window.location.href) {
      window.history.pushState({ term }, '', url);
    }
  } catch (error) {
    // history is unavailable in some embedded contexts; searching still works
  }
};
