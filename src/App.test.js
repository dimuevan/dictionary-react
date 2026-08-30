import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import App from './App';
import React from 'react';

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

  expect(await screen.findByText(/service may be down.*not your spelling/i)).toBeInTheDocument();
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
