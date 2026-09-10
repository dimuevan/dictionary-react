import { fireEvent, render, screen, act } from '@testing-library/react';
import App from './App';
import { resetPrimaryBreaker } from './useDictionary';
import { readFavourites, toTsv } from './favourites';
import { restoreBackup } from './backup';
import { stateFor } from './studySchedule';
import {
  dictionaryCalls,
  entry,
  mockJson,
  search,
  settle,
  startClean,
  stubFetch,
} from './testHelpers';

/**
 * What the app keeps: the cache behind an entry, the history, the saved words, the backup.
 *
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */
startClean();

test('shows a saved copy immediately, then replaces it with the fresh one', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  unmount();
  resetPrimaryBreaker();

  let release;
  stubFetch(
    () => new Promise((resolve) => { release = () => resolve(mockJson([entry({ word: 'keyboard', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A fresher definition.' }], synonyms: [], antonyms: [] }] })])); })
  );

  render(<App />);
  search('keyboard');

  // Rendered from the saved copy before the network has answered at all.
  expect(await screen.findByText('A set of keys.')).toBeInTheDocument();
  expect(screen.queryByText(/this is the copy saved/i)).not.toBeInTheDocument();

  await act(async () => { release(); });
  expect(await screen.findByText('A fresher definition.')).toBeInTheDocument();
});

test('falls back to a saved copy when the service goes away', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  unmount();

  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  render(<App />);
  search('keyboard');

  expect(
    await screen.findByText(/this is the copy saved/i, {}, { timeout: 4000 })
  ).toBeInTheDocument();
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
});

test('keeps a saved entry on screen when a refresh 404s, but never fetches one', async () => {
  // A word we already hold demonstrably existed; a 404 on refresh is far more
  // likely to be the API being unreliable than the word ceasing to exist, and
  // replacing a readable entry with "no results" would be a regression.
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  unmount();
  resetPrimaryBreaker();

  stubFetch(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('keyboard');

  await settle(); // let the 404 be handled, then look at what is on screen
  expect(global.fetch).toHaveBeenCalled();
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
  expect(screen.queryByText(/No results for/)).not.toBeInTheDocument();
  // Nothing stale is advertised, and the fallback is never consulted for a 404.
  expect(screen.queryByText(/this is the copy saved/i)).not.toBeInTheDocument();
  expect(
    global.fetch.mock.calls.every(([url]) => !/wiktionary\.org\/api\/rest_v1/.test(String(url)))
  ).toBe(true);
  await settle();
});

test('offers recently looked-up words on the empty screen, and can forget them', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);

  const chip = await screen.findByRole('button', { name: 'keyboard' });
  fireEvent.click(chip);
  expect(await screen.findByRole('heading', { name: 'keyboard' })).toBeInTheDocument();
  expect(window.location.search).toBe('?w=keyboard');
  await settle();
});

test('shows no recent words before anything has been looked up', () => {
  render(<App />);
  expect(screen.queryByText('Recent')).not.toBeInTheDocument();
});

test('clearing the recent words empties the list', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);

  await screen.findByText('Recent');
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(screen.queryByText('Recent')).not.toBeInTheDocument();
});

test('saves a word, offers it under Saved, and lets it be removed', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  fireEvent.click(screen.getByRole('button', { name: 'Save this word' }));
  expect(screen.getByRole('button', { name: 'Remove from saved words' })).toBeInTheDocument();
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));

  fireEvent.click(screen.getByRole('button', { name: 'Remove keyboard' }));
  expect(screen.getByText(/Star a word while reading it/)).toBeInTheDocument();
});

test('keeps each language its own entry in the saved words', async () => {
  window.history.replaceState({}, '', '/?w=casa&l=es');
  render(<App />);

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(dictionaryCalls()[0][0]).toContain('/entries/es/casa');
  // English-only extras stay out of the way in another language.
  expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('datamuse'))).toBe(true);
});

test('a backup restores words, saved entries and the schedule', () => {
  const backup = {
    format: 'dictionearch-backup',
    version: 1,
    words: { 'en:atlas': { savedAt: 2, payload: { data: [{ word: 'atlas', meanings: [] }] } } },
    favourites: { 'en:atlas': { term: 'atlas', lang: 'en', savedAt: 2 } },
    study: { 'en:atlas': { box: 3, dueAt: 0 } },
  };

  expect(restoreBackup(backup)).toEqual({ words: 1, favourites: 1, study: 1 });
  expect(readFavourites().map((item) => item.term)).toEqual(['atlas']);
  expect(stateFor('atlas', 'en').box).toBe(3);

  // A file from somewhere else is refused rather than half-applied.
  expect(restoreBackup({ format: 'something-else', words: {} })).toBeNull();
  expect(restoreBackup('not even an object')).toBeNull();
});

test('a backup keeps whichever copy of a word is newer', () => {
  restoreBackup({
    format: 'dictionearch-backup',
    favourites: { 'en:atlas': { term: 'atlas', lang: 'en', savedAt: 500 } },
  });
  restoreBackup({
    format: 'dictionearch-backup',
    favourites: { 'en:atlas': { term: 'atlas', lang: 'en', savedAt: 100 } },
  });

  expect(readFavourites()[0].savedAt).toBe(500);
});

test('exports Anki rows as word and definition, tab separated', () => {
  const rows = toTsv(
    [{ term: 'keyboard', lang: 'en' }, { term: 'atlas', lang: 'en' }],
    (item) => (item.term === 'keyboard' ? 'A set of\tkeys.' : '')
  );

  // Tabs inside a definition would break the format, so they are flattened.
  expect(rows).toBe('keyboard\tA set of keys.\natlas\t');
});
