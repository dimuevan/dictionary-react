import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './App';
import {
  entry,
  failPrimaryThen,
  lookupSources,
  mockJson,
  search,
  settle,
  startClean,
  stubAudio,
  stubFetch,
  wiktionaryPayload,
} from './testHelpers';

/**
 * Every way a lookup can fail, and what the reader is told about it.
 *
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */
startClean();

test('shows an error message when the word is not found', async () => {
  stubFetch(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  // The live region is always mounted, so wait for its text rather than the node.
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Word not found'));
  expect(screen.queryByRole('heading', { name: 'zzzzqqq' })).not.toBeInTheDocument();
});

test('says a failed fetch is a connection problem, and offers a retry', async () => {
  // fetch() rejects with a TypeError when the request never reaches the server.
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
  render(<App />);
  search('hello');

  expect(
    await screen.findByText(/service may be down.*not your spelling/i, {}, { timeout: 4000 })
  ).toBeInTheDocument();
  // One attempt at the primary, then straight to the Wiktionary fallback.
  expect(lookupSources()).toEqual(['primary', 'wiktionary']);
  // The raw browser string never reaches the reader.
  expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Check the spelling/i)).not.toBeInTheDocument();

  stubFetch(() => mockJson([entry()]));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'keyboard' })).toBeInTheDocument();
});

test('offers no retry for a word that simply does not exist', async () => {
  stubFetch(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  expect(await screen.findByText(/No results for/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

/**
 * The recordings come from someone else's server, and one of them being gone is
 * the ordinary case, not the exotic one. `play()` rejecting and the element
 * firing `error` are two different ways of the same thing happening.
 */

test('says so when the browser refuses to play a recording', async () => {
  stubAudio('rejects');
  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  fireEvent.click(screen.getByRole('button', { name: 'Play pronunciation' }));

  expect(await screen.findByText(/would not play/i)).toBeInTheDocument();
  // The phonetic spelling is the point of the section, and it stays.
  expect(screen.getByText('/\u02c8ki\u02d0b\u0254\u02d0d/')).toBeInTheDocument();
});

test('says so when the recording itself cannot be loaded', async () => {
  const created = stubAudio('resolves');
  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  fireEvent.click(screen.getByRole('button', { name: 'Play pronunciation' }));
  await settle();
  expect(screen.queryByText(/would not play/i)).not.toBeInTheDocument();

  // The file is missing: the element reports it after playback was requested.
  act(() => created[0].onerror(new Event('error')));
  expect(screen.getByText(/would not play/i)).toBeInTheDocument();
});

test('forgets a failed recording when the next word opens', async () => {
  stubAudio('rejects');
  stubFetch((url) => mockJson([entry({ word: decodeURIComponent(url.split('/').pop()) })]));
  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  fireEvent.click(screen.getByRole('button', { name: 'Play pronunciation' }));
  await screen.findByText(/would not play/i);

  search('cat');
  await screen.findByRole('heading', { name: 'cat' });
  expect(screen.queryByText(/would not play/i)).not.toBeInTheDocument();
});

test('stops asking a primary that just failed, and goes straight to Wiktionary', async () => {
  global.fetch = failPrimaryThen(() => mockJson(wiktionaryPayload));
  render(<App />);

  search('word');
  await screen.findByRole('heading', { name: 'word' }, {}, { timeout: 4000 });

  global.fetch.mockClear();
  search('other');
  await settle();

  // The second search skips the dead primary entirely.
  await waitFor(() => expect(lookupSources()).toEqual(['wiktionary']));
  await settle();
});

test('gives the primary another chance when the reader asks for one', async () => {
  global.fetch = failPrimaryThen(() => mockJson(wiktionaryPayload));
  render(<App />);
  search('word');
  await screen.findByText(/straight from Wiktionary/i, {}, { timeout: 4000 });

  stubFetch(() => mockJson([entry()]));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(lookupSources()[0]).toBe('primary');
});

test('gives up on a hanging request instead of waiting forever', async () => {
  vi.useFakeTimers();
  stubFetch((url, options) => {
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
    vi.advanceTimersByTime(4000); // past the 3.5s primary deadline
  });
  vi.useRealTimers();

  expect(await screen.findByRole('heading', { name: 'word' })).toBeInTheDocument();
  expect(screen.getByText(/straight from Wiktionary/i)).toBeInTheDocument();
});

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
  stubFetch(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  await screen.findByText(/No results for/);
  // The dictionary is asked once; only the spelling-suggestion service follows.
  const hosts = global.fetch.mock.calls.map(([url]) => new URL(String(url)).hostname);
  expect(hosts).not.toContain('en.wiktionary.org');
  expect(hosts.filter((host) => host === 'api.dictionaryapi.dev')).toHaveLength(1);
});

test('reports the failure when both sources are away and nothing is saved', async () => {
  stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
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

test('shows no results for an unknown word it has never seen', async () => {
  stubFetch(() => mockJson({}, { ok: false, status: 404 }));
  render(<App />);
  search('zzzzqqq');

  expect(await screen.findByText(/No results for/)).toBeInTheDocument();
});

// Shaped like a real Wikimedia REST definition payload: keyed by language,
// parts of speech capitalised, definitions and examples as HTML fragments.

test('suggests words spelled like the one that was not found', async () => {
  stubFetch((url) => {
    if (String(url).includes('datamuse.com')) {
      return mockJson([{ word: 'keyboard' }, { word: 'keybox' }, { word: 'zzzzqqq' }]);
    }
    return mockJson({}, { ok: false, status: 404 });
  }, { extras: true });

  render(<App />);
  search('zzzzqqq');

  await screen.findByText('Did you mean');
  // The word that failed is not offered back as a suggestion.
  expect(screen.queryByRole('button', { name: 'zzzzqqq' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'keyboard' }));
  expect(window.location.search).toBe('?w=keyboard');
  await settle();
});

test('a suggestion service that is down costs the reader nothing', async () => {
  stubFetch((url) =>
    String(url).includes('datamuse.com')
      ? Promise.reject(new TypeError('Failed to fetch'))
      : mockJson({}, { ok: false, status: 404 })
  , { extras: true });

  render(<App />);
  search('zzzzqqq');

  expect(await screen.findByText(/No results for/)).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Did you mean')).not.toBeInTheDocument();
});
