import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import App from './App';
import React from 'react';
import { resetPrimaryBreaker } from './useDictionary';

/**
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */

const entry = (overrides = {}) => ({
  word: 'keyboard',
  phonetics: [{ text: '/ˈkiːbɔːd/', audio: 'https://example.com/keyboard.mp3' }],
  meanings: [
    {
      partOfSpeech: 'noun',
      definitions: [{ definition: 'A set of keys.', example: 'I type on my keyboard.' }],
      synonyms: ['electronic keyboard'],
      antonyms: [],
    },
  ],
  sourceUrls: ['https://en.wiktionary.org/wiki/keyboard'],
  ...overrides,
});

const mockJson = (payload, { ok = true, status = 200 } = {}) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(payload) });

const search = (word) => {
  fireEvent.change(screen.getByLabelText('Search for a word'), { target: { value: word } });
  fireEvent.submit(screen.getByLabelText('Search for a word').closest('form'));
};

beforeEach(() => {
  global.fetch = jest.fn(() => mockJson([entry()]));
  window.localStorage.clear();
  resetPrimaryBreaker(); // module-level state must not leak between tests
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders the word, its definition and the play button', async () => {
  render(<App />);
  search('keyboard');

  expect(await screen.findByRole('heading', { name: 'keyboard' })).toBeInTheDocument();
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
  expect(screen.getByText('/ˈkiːbɔːd/')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play pronunciation' })).toBeInTheDocument();
});

test('shows an error message when the word is not found', async () => {
  global.fetch = jest.fn(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  // The live region is always mounted, so wait for its text rather than the node.
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Word not found'));
  expect(screen.queryByRole('heading', { name: 'zzzzqqq' })).not.toBeInTheDocument();
});

test('says a failed fetch is a connection problem, and offers a retry', async () => {
  // fetch() rejects with a TypeError when the request never reaches the server.
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
  render(<App />);
  search('hello');

  expect(
    await screen.findByText(/service may be down.*not your spelling/i, {}, { timeout: 4000 })
  ).toBeInTheDocument();
  // One attempt at the primary, then straight to the Wiktionary fallback.
  const hosts = global.fetch.mock.calls.map(([url]) =>
    String(url).includes('wiktionary.org') ? 'wiktionary' : 'primary'
  );
  expect(hosts).toEqual(['primary', 'wiktionary']);
  // The raw browser string never reaches the reader.
  expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Check the spelling/i)).not.toBeInTheDocument();

  global.fetch = jest.fn(() => mockJson([entry()]));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'keyboard' })).toBeInTheDocument();
});

test('offers no retry for a word that simply does not exist', async () => {
  global.fetch = jest.fn(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  expect(await screen.findByText(/No results for/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

test('hides the play button but still shows the phonetic text when there is no audio', async () => {
  global.fetch = jest.fn(() =>
    mockJson([entry({ phonetics: [{ text: '/eɪ/', audio: '' }] })])
  );
  render(<App />);
  search('keyboard');

  expect(await screen.findByText('/eɪ/')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Play pronunciation' })).not.toBeInTheDocument();
});

test('renders a meaning that carries no synonyms or antonyms', async () => {
  global.fetch = jest.fn(() =>
    mockJson([
      entry({
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'No synonyms key.' }] }],
      }),
    ])
  );
  render(<App />);
  search('keyboard');

  expect(await screen.findByText('No synonyms key.')).toBeInTheDocument();
  // The definition has no example, so no empty quotes should be rendered.
  expect(screen.queryByText('""')).not.toBeInTheDocument();
});

test('searching the same word twice sends a second request', async () => {
  render(<App />);

  search('cat');
  await screen.findByRole('heading', { name: 'keyboard' });

  search('cat');
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
});

test('encodes the search term into the request URL', async () => {
  render(<App />);
  search('  A B/C  ');

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(global.fetch.mock.calls[0][0]).toBe(
    'https://api.dictionaryapi.dev/api/v2/entries/en/a%20b%2Fc'
  );
});

test('stops asking a primary that just failed, and goes straight to Wiktionary', async () => {
  global.fetch = failPrimaryThen(() => mockJson(wiktionaryPayload));
  render(<App />);

  search('word');
  await screen.findByRole('heading', { name: 'word' }, {}, { timeout: 4000 });

  global.fetch.mockClear();
  search('other');
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  // The second search skips the dead primary entirely.
  const hosts = global.fetch.mock.calls.map(([url]) =>
    String(url).includes('wiktionary.org') ? 'wiktionary' : 'primary'
  );
  expect(hosts).toEqual(['wiktionary']);
});

test('gives the primary another chance when the reader asks for one', async () => {
  global.fetch = failPrimaryThen(() => mockJson(wiktionaryPayload));
  render(<App />);
  search('word');
  await screen.findByText(/straight from Wiktionary/i, {}, { timeout: 4000 });

  global.fetch = jest.fn(() => mockJson([entry()]));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(String(global.fetch.mock.calls[0][0])).toContain('dictionaryapi.dev');
});

test('gives up on a hanging request instead of waiting forever', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((url, options) => {
    if (String(url).includes('wiktionary.org')) return mockJson(wiktionaryPayload);
    // Never settles on its own; only the deadline can end it.
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const aborted = new Error('The user aborted a request.');
        aborted.name = 'AbortError';
        reject(aborted);
      });
    });
  });

  render(<App />);
  search('word');

  await act(async () => {
    jest.advanceTimersByTime(4000); // past the 3.5s primary deadline
  });
  jest.useRealTimers();

  expect(await screen.findByRole('heading', { name: 'word' })).toBeInTheDocument();
  expect(screen.getByText(/straight from Wiktionary/i)).toBeInTheDocument();
});

test('shows a saved copy immediately, then replaces it with the fresh one', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  unmount();
  resetPrimaryBreaker();

  let release;
  global.fetch = jest.fn(
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

  global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
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

  global.fetch = jest.fn(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('keyboard');

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
  expect(screen.queryByText(/No results for/)).not.toBeInTheDocument();
  // Nothing stale is advertised, and the fallback is never consulted for a 404.
  expect(screen.queryByText(/this is the copy saved/i)).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('wiktionary'))).toBe(true);
});

test('shows no results for an unknown word it has never seen', async () => {
  global.fetch = jest.fn(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  expect(await screen.findByText(/No results for/)).toBeInTheDocument();
});

// Shaped like a real Wikimedia REST definition payload: keyed by language,
// parts of speech capitalised, definitions and examples as HTML fragments.
const wiktionaryPayload = {
  en: [
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [
        {
          definition: 'The smallest <a href="/wiki/unit">unit</a> of language &amp; meaning.',
          examples: ['<i>He said a kind <b>word</b>.</i>'],
        },
        { definition: 'Something <i>said</i>.' },
      ],
    },
    {
      partOfSpeech: 'Verb',
      language: 'English',
      definitions: [{ definition: 'To phrase in a particular way.' }],
    },
  ],
  fr: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'ignored, not English' }] }],
};

const failPrimaryThen = (wiktionaryResponse) =>
  jest.fn((url) =>
    String(url).includes('wiktionary.org')
      ? wiktionaryResponse()
      : Promise.reject(new TypeError('Failed to fetch'))
  );

test('falls back to Wiktionary when the primary dictionary is unreachable', async () => {
  global.fetch = failPrimaryThen(() => mockJson(wiktionaryPayload));
  render(<App />);
  search('word');

  expect(
    await screen.findByRole('heading', { name: 'word' }, { timeout: 4000 })
  ).toBeInTheDocument();

  // HTML fragments arrive as readable text, entities decoded, tags gone.
  expect(screen.getByText('The smallest unit of language & meaning.')).toBeInTheDocument();
  expect(screen.getByText('"He said a kind word."')).toBeInTheDocument();
  expect(screen.queryByText(/<a href/)).not.toBeInTheDocument();

  // Both English parts of speech render; the French block is ignored.
  expect(screen.getByText('Noun')).toBeInTheDocument();
  expect(screen.getByText('Verb')).toBeInTheDocument();
  expect(screen.queryByText(/not English/)).not.toBeInTheDocument();

  // Wiktionary has no audio here, so the play button must not appear.
  expect(screen.queryByRole('button', { name: 'Play pronunciation' })).not.toBeInTheDocument();
  expect(screen.getByText(/straight from Wiktionary/i)).toBeInTheDocument();
});

test('does not consult Wiktionary when the word simply does not exist', async () => {
  global.fetch = jest.fn(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  await screen.findByText(/No results for/);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('wiktionary'))).toBe(true);
});

test('reports the failure when both sources are away and nothing is saved', async () => {
  global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch')));
  render(<App />);
  search('word');

  expect(
    await screen.findByText(/service may be down.*not your spelling/i, {}, { timeout: 4000 })
  ).toBeInTheDocument();
  expect(screen.queryByText(/straight from Wiktionary/i)).not.toBeInTheDocument();
});

test('ignores a Wiktionary payload with no usable English definitions', async () => {
  global.fetch = failPrimaryThen(() => mockJson({ fr: [{ partOfSpeech: 'Nom', definitions: [] }] }));
  render(<App />);
  search('word');

  expect(
    await screen.findByText(/service may be down.*not your spelling/i, {}, { timeout: 4000 })
  ).toBeInTheDocument();
});
