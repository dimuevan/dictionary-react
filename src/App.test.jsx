import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import App from './App';
import { resetPrimaryBreaker } from './useDictionary';
import { wordOfTheDay } from './wordOfTheDay';
import { boxCounts, dueEntries, recordAnswer, stateFor } from './studySchedule';
import { readFavourites, toTsv } from './favourites';
import { restoreBackup } from './backup';
import { readExtra } from './extrasCache';

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

/** Only the calls to the dictionary itself, ignoring the optional extras. */
const dictionaryCalls = () =>
  global.fetch.mock.calls.filter(([url]) => String(url).includes('dictionaryapi.dev'));

/**
 * Which lookup sources were asked, in order. Naming them explicitly matters:
 * the page also talks to Datamuse and to Wiktionary's parse API for the extras,
 * and counting those as lookups made these assertions depend on timing.
 */
const lookupSources = () =>
  global.fetch.mock.calls
    .map(([url]) => String(url))
    .filter(
      (url) =>
        url.includes('dictionaryapi.dev') || url.includes('/api/rest_v1/page/definition')
    )
    .map((url) => (url.includes('wiktionary.org') ? 'wiktionary' : 'primary'));

/**
 * Lets whatever the app still has in flight — an entry that is still arriving,
 * or one of the optional extras — finish inside act(). A test that walks away
 * mid-request leaves React updating a tree nobody is watching, and React says
 * so, once per update: a hundred warnings a run is where a real one hides.
 *
 * Microtasks only: one test drives the lookup deadline with fake timers, and
 * waiting on a real one there would never return.
 */
const settle = () =>
  act(async () => {
    const drainMicrotasks = async () => {
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    };

    await drainMicrotasks();
    // One turn of the event loop as well, for work that is waiting on a timer
    // rather than on a promise — except where a test is driving the clock
    // itself, in which case a real timer would never come back.
    if (!vi.isFakeTimers()) await new Promise((resolve) => setTimeout(resolve, 0));
    await drainMicrotasks();
  });

const search = (word) => {
  fireEvent.change(screen.getByLabelText('Search for a word'), { target: { value: word } });
  fireEvent.submit(screen.getByLabelText('Search for a word').closest('form'));
};

const isExtra = (url) => url.includes('datamuse.com') || url.includes('api.php');

/**
 * Installs the fetch mock for a test. Requests for the optional extras —
 * frequency, rhymes, completions, etymology — are answered with nothing before
 * the test's own handler ever sees them, unless the test says `extras: true`.
 *
 * That default is what silenced a hundred act() warnings a run. A mock written
 * for the dictionary answered Datamuse too, so rhymes and completions came back
 * with real words and their state landed after the test had stopped asserting.
 * Now nothing is in flight unless a test asked for it, and a test that wants an
 * extra has to say so — which also stops it depending on an extra by accident.
 */
const stubFetch = (handler, { extras = false } = {}) => {
  global.fetch = vi.fn((url, options) => {
    const target = String(url);
    if (!extras && isExtra(target)) {
      return target.includes('api.php') ? mockJson({}) : mockJson([]);
    }
    return handler(target, options);
  });
};

beforeEach(() => {
  stubFetch(() => mockJson([entry()]));
  window.localStorage.clear();
  resetPrimaryBreaker(); // module-level state must not leak between tests
  window.history.replaceState({}, '', '/'); // nor must the address bar
});

afterEach(() => {
  vi.restoreAllMocks();
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
const stubAudio = (behaviour) => {
  const created = [];
  vi.stubGlobal(
    'Audio',
    class {
      constructor(src) {
        this.src = src;
        created.push(this);
      }

      play() {
        return behaviour === 'rejects' ? Promise.reject(new Error('blocked')) : Promise.resolve();
      }
    }
  );
  return created;
};

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

test('hides the play button but still shows the phonetic text when there is no audio', async () => {
  stubFetch(() =>
    mockJson([entry({ phonetics: [{ text: '/eɪ/', audio: '' }] })])
  );
  render(<App />);
  search('keyboard');

  expect(await screen.findByText('/eɪ/')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Play pronunciation' })).not.toBeInTheDocument();
});

test('renders a meaning that carries no synonyms or antonyms', async () => {
  stubFetch(() =>
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
  // Count only the dictionary: the extras (frequency, etymology) have their own
  // requests and are not what this test is about.
  await waitFor(() =>
    expect(dictionaryCalls()).toHaveLength(2)
  );
  await settle();
});

test('encodes the search term into the request URL', async () => {
  render(<App />);
  search('  A B/C  ');

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(global.fetch.mock.calls[0][0]).toBe(
    'https://api.dictionaryapi.dev/api/v2/entries/en/a%20b%2Fc'
  );
  await settle();
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

test('shows no results for an unknown word it has never seen', async () => {
  stubFetch(() => mockJson({}, { ok: false, status: 404 }));
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
  vi.fn((url) =>
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


test('puts the word in the address bar so it can be shared and reopened', async () => {
  render(<App />);
  search('keyboard');

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(window.location.search).toBe('?w=keyboard');
});

test('opens the word the address bar arrives with', async () => {
  window.history.replaceState({}, '', '/?w=keyboard');
  render(<App />);

  expect(await screen.findByRole('heading', { name: 'keyboard' })).toBeInTheDocument();
  expect(screen.getByLabelText('Search for a word')).toHaveValue('keyboard');
});

test('puts the word in the tab title, and takes it back out', async () => {
  render(<App />);
  expect(document.title).toBe('Dictionearch by iamevandimu.com');

  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  // The title is the bookmark name and the history entry, not decoration.
  expect(document.title).toBe('keyboard — Dictionearch');
  await settle();
});

test('follows the browser back button between words', async () => {
  // Every word answers with its own entry, so the heading proves which one the
  // page is actually showing.
  stubFetch((url) => mockJson([entry({ word: decodeURIComponent(url.split('/').pop()) })]));
  render(<App />);

  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  expect(window.location.search).toBe('?w=keyboard');
  search('cat');
  await screen.findByRole('heading', { name: 'cat' });
  expect(window.location.search).toBe('?w=cat');

  // jsdom updates the URL but does not fire popstate for us.
  window.history.replaceState({}, '', '/?w=keyboard');
  fireEvent.popState(window);

  await waitFor(() => expect(screen.getByLabelText('Search for a word')).toHaveValue('keyboard'));
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

test('a synonym starts a new lookup', async () => {
  stubFetch((url) =>
    String(url).includes('electronic')
      ? mockJson([entry({ word: 'electronic keyboard' })])
      : mockJson([entry()])
  );

  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  fireEvent.click(screen.getByRole('button', { name: 'electronic keyboard' }));

  expect(
    await screen.findByRole('heading', { name: 'electronic keyboard' })
  ).toBeInTheDocument();
  expect(window.location.search).toBe('?w=electronic+keyboard');
});


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

test('offers one button per recording when the word has several', async () => {
  stubFetch(() =>
    mockJson([
      entry({
        phonetics: [
          { text: '/ˈkiːbɔːd/', audio: 'https://example.com/keyboard-uk.mp3' },
          { text: '/ˈkiːbɔɹd/', audio: 'https://example.com/keyboard-us.mp3' },
          { text: '', audio: 'https://example.com/keyboard-us.mp3' }, // duplicate
        ],
      }),
    ])
  );

  render(<App />);
  search('keyboard');

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(screen.getByRole('button', { name: 'UK' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'US' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^(UK|US|AU|CA)$/ })).toHaveLength(2);

  // The first is selected, and choosing the other moves the phonetic text with it.
  expect(screen.getByRole('button', { name: 'UK' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'US' }));
  expect(screen.getByRole('button', { name: 'US' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('/ˈkiːbɔɹd/')).toBeInTheDocument();
});

test('shows no pronunciation chips when there is only one recording', async () => {
  render(<App />);
  search('keyboard');

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(screen.queryByRole('group', { name: 'Pronunciations' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play pronunciation' })).toBeInTheDocument();
});

test('remembers the chosen typeface', async () => {
  const { unmount } = render(<App />);

  fireEvent.change(screen.getByLabelText('Typeface'), { target: { value: 'mono' } });
  expect(document.body.className).toContain('font-mono');
  unmount();

  render(<App />);
  expect(screen.getByLabelText('Typeface')).toHaveValue('mono');
  expect(document.body.className).toContain('font-mono');
});

test('/ focuses the search box and Escape empties it', async () => {
  render(<App />);
  const input = screen.getByLabelText('Search for a word');

  input.blur();
  fireEvent.keyDown(window, { key: '/' });
  expect(input).toHaveFocus();

  // Escape belongs to the box now, not to the window.
  fireEvent.change(input, { target: { value: 'keyboard' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('');
});

test('offers a word of the day that opens like any other search', async () => {
  render(<App />);

  const daily = wordOfTheDay();
  const button = screen.getByRole('button', { name: daily });
  fireEvent.click(button);

  await waitFor(() => expect(window.location.search).toBe(`?w=${daily}`));
  await settle();
});

test('the word of the day is stable within a day and changes across days', () => {
  const monday = new Date('2026-09-07T09:00:00Z');
  const mondayNight = new Date('2026-09-07T23:00:00Z');
  const tuesday = new Date('2026-09-08T09:00:00Z');

  expect(wordOfTheDay(monday)).toBe(wordOfTheDay(mondayNight));
  expect(wordOfTheDay(monday)).not.toBe(wordOfTheDay(tuesday));
});

// ---------------------------------------------------------------- new features

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

test('copies a shareable link for the word on screen', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  fireEvent.click(screen.getByRole('button', { name: 'Copy link to this word' }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0][0]).toContain('?w=keyboard');
});

test('reads a word in another language, and says so in the address bar', async () => {
  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } });

  await waitFor(() =>
    expect(dictionaryCalls().some(([url]) => String(url).includes('/entries/es/'))).toBe(true)
  );
  expect(window.location.search).toContain('l=es');
  await settle();
});

test('keeps each language its own entry in the saved words', async () => {
  window.history.replaceState({}, '', '/?w=casa&l=es');
  render(<App />);

  await screen.findByRole('heading', { name: 'keyboard' });
  expect(dictionaryCalls()[0][0]).toContain('/entries/es/casa');
  // English-only extras stay out of the way in another language.
  expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('datamuse'))).toBe(true);
});

test('shows how common a word is when the frequency service answers', async () => {
  stubFetch((url) => {
    if (String(url).includes('datamuse.com')) {
      return mockJson([{ word: 'keyboard', tags: ['n', 'f:12.5'] }]);
    }
    return mockJson([entry()]);
  }, { extras: true });

  render(<App />);
  search('keyboard');

  expect(await screen.findByText('common', { exact: false })).toBeInTheDocument();
});

test('offers completions while typing, and Escape closes them', async () => {
  stubFetch((url) =>
    String(url).includes('datamuse.com')
      ? mockJson([{ word: 'keyboard' }, { word: 'keyboardist' }])
      : mockJson([entry()])
  , { extras: true });

  render(<App />);
  const input = screen.getByLabelText('Search for a word');
  fireEvent.change(input, { target: { value: 'keyb' } });

  await screen.findByRole('option', { name: 'keyboardist' }, { timeout: 3000 });
  expect(screen.getByRole('listbox', { name: 'Suggestions' })).toBeInTheDocument();

  fireEvent.keyDown(input, { key: 'Escape' });
  // Hidden, so it leaves the accessibility tree entirely — the select menus on
  // the page keep their own options, which is why this asks for the listbox.
  await waitFor(() =>
    expect(screen.queryByRole('listbox', { name: 'Suggestions' })).not.toBeInTheDocument()
  );
  expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('choosing a completion runs that search', async () => {
  stubFetch((url) =>
    String(url).includes('datamuse.com')
      ? mockJson([{ word: 'keyboardist' }])
      : mockJson([entry()])
  , { extras: true });

  render(<App />);
  fireEvent.change(screen.getByLabelText('Search for a word'), { target: { value: 'keyb' } });

  fireEvent.click(await screen.findByRole('option', { name: 'keyboardist' }, { timeout: 3000 }));
  await waitFor(() => expect(window.location.search).toBe('?w=keyboardist'));
  await settle();
});

test('arrow keys walk the suggestions and Enter takes the highlighted one', async () => {
  stubFetch((url) =>
    String(url).includes('datamuse.com')
      ? mockJson([{ word: 'keyboard' }, { word: 'keyboardist' }])
      : mockJson([entry()])
  , { extras: true });

  render(<App />);
  const input = screen.getByLabelText('Search for a word');
  fireEvent.change(input, { target: { value: 'keyb' } });

  await screen.findByRole('option', { name: 'keyboard' }, { timeout: 3000 });
  expect(input).toHaveAttribute('aria-expanded', 'true');

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: 'keyboard' })).toHaveAttribute('aria-selected', 'true');
  expect(input.getAttribute('aria-activedescendant')).toBe(
    screen.getByRole('option', { name: 'keyboard' }).id
  );

  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: 'keyboardist' })).toHaveAttribute('aria-selected', 'true');

  // Wrapping round and back proves both directions.
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(screen.getByRole('option', { name: 'keyboard' })).toHaveAttribute('aria-selected', 'true');

  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(window.location.search).toBe('?w=keyboard'));
  await settle();
});

test('shows the origin of a word when Wiktionary has one', async () => {
  stubFetch((url) => {
    if (String(url).includes('api.php')) {
      return mockJson({
        parse: {
          text:
            '<h2>English</h2><h3>Etymology</h3><p>From Middle English <i>keye</i> plus board.</p>' +
            '<h3>Noun</h3><p>Not the etymology.</p>',
        },
      });
    }
    return mockJson([entry()]);
  }, { extras: true });

  render(<App />);
  search('keyboard');

  expect(
    await screen.findByText('From Middle English keye plus board.')
  ).toBeInTheDocument();
  expect(screen.getByText('Origin')).toBeInTheDocument();
});

const etymologyPage = (text) =>
  mockJson({ parse: { text: `<h3>Etymology</h3><p>${text}</p>` } });

test('asks for an origin once, not on every visit to the same word', async () => {
  stubFetch((url) => (url.includes('api.php') ? etymologyPage('From key plus board.') : mockJson([entry()])), {
    extras: true,
  });

  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByText('From key plus board.');
  expect(readExtra('keyboard', 'en', 'etymology')).toBe('From key plus board.');
  unmount();

  global.fetch.mockClear();
  render(<App />);
  search('keyboard');

  // The origin is on screen again, and Wiktionary was never asked for it.
  expect(await screen.findByText('From key plus board.')).toBeInTheDocument();
  expect(global.fetch.mock.calls.every(([url]) => !String(url).includes('api.php'))).toBe(true);
  await settle();
});

test('does not remember a service that had nothing to say', async () => {
  // An outage must not become a month of remembered silence.
  stubFetch((url) => (url.includes('api.php') ? mockJson({}) : mockJson([entry()])), { extras: true });

  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  await settle();
  expect(readExtra('keyboard', 'en', 'etymology')).toBe(null);
  unmount();

  stubFetch((url) => (url.includes('api.php') ? etymologyPage('From key plus board.') : mockJson([entry()])), {
    extras: true,
  });
  render(<App />);
  search('keyboard');

  expect(await screen.findByText('From key plus board.')).toBeInTheDocument();
});

test('declares the language of the entry, not of the page', async () => {
  render(<App />);
  search('keyboard');
  expect(await screen.findByRole('heading', { name: 'keyboard' })).toHaveAttribute('lang', 'en');

  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'es' } });

  // A screen reader should not read a Spanish entry with English rules.
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'keyboard' })).toHaveAttribute('lang', 'es')
  );
  await settle();
});

test('says nothing about origin when the page has no etymology section', async () => {
  stubFetch((url) =>
    String(url).includes('api.php')
      ? mockJson({ parse: { text: '<h2>English</h2><h3>Noun</h3><p>Only a definition.</p>' } })
      : mockJson([entry()])
  , { extras: true });

  render(<App />);
  search('keyboard');

  await screen.findByRole('heading', { name: 'keyboard' });
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByText('Origin')).not.toBeInTheDocument();
});

test('study cards ask for the word behind a definition', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  fireEvent.click(screen.getByRole('button', { name: 'Save this word' }));
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  // The definition is shown first; the word is the answer.
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'keyboard' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show the word' }));
  expect(screen.getByRole('button', { name: 'keyboard' })).toBeInTheDocument();
});

// ------------------------------------------------------- third board of ideas

test('long entries collapse, and open on request', async () => {
  const many = Array.from({ length: 7 }, (unused, index) => ({
    definition: `Sense number ${index + 1}.`,
  }));
  stubFetch((url) =>
    String(url).includes('dictionaryapi')
      ? mockJson([entry({ meanings: [{ partOfSpeech: 'noun', definitions: many, synonyms: [], antonyms: [] }] })])
      : mockJson([])
  );

  render(<App />);
  search('set');

  expect(await screen.findByText('Sense number 3.')).toBeInTheDocument();
  expect(screen.queryByText('Sense number 4.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show all 7 definitions' }));
  expect(screen.getByText('Sense number 7.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
  expect(screen.queryByText('Sense number 7.')).not.toBeInTheDocument();
});

test('offers rhymes and similar words, each a new lookup', async () => {
  stubFetch((url) => {
    const target = String(url);
    if (target.includes('rel_rhy')) return mockJson([{ word: 'fjord' }]);
    if (target.includes('ml=')) return mockJson([{ word: 'typewriter' }]);
    if (target.includes('datamuse')) return mockJson([]);
    return mockJson([entry()]);
  }, { extras: true });

  render(<App />);
  search('keyboard');

  expect(await screen.findByText('Rhymes')).toBeInTheDocument();
  expect(screen.getByText('Similar in meaning')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'typewriter' }));
  await waitFor(() => expect(window.location.search).toBe('?w=typewriter'));
  await settle();
});

test('a card answered correctly leaves the queue', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  fireEvent.click(screen.getByRole('button', { name: 'Save this word' }));
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  expect(screen.getByText(/box 1/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show the word' }));
  fireEvent.click(screen.getByRole('button', { name: 'I knew it' }));

  // Only one saved word, so answering it empties the queue.
  expect(screen.getByText(/1 card reviewed/)).toBeInTheDocument();
  expect(screen.getByText(/Next review tomorrow/)).toBeInTheDocument();
});

test('the schedule moves a word up on success and back to the first box on failure', () => {
  const now = Date.UTC(2026, 0, 1);

  expect(recordAnswer('keyboard', 'en', true, now).box).toBe(2);
  expect(recordAnswer('keyboard', 'en', true, now).box).toBe(3);
  expect(recordAnswer('keyboard', 'en', false, now)).toEqual({ box: 1, dueAt: now });

  // Box 1 is due at once; a promoted word is not.
  expect(dueEntries([{ term: 'keyboard', lang: 'en' }], now)).toHaveLength(1);
  recordAnswer('keyboard', 'en', true, now);
  expect(dueEntries([{ term: 'keyboard', lang: 'en' }], now)).toHaveLength(0);
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

test('offers the entry as an image without failing where canvas is unavailable', async () => {
  render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  const button = screen.getByRole('button', { name: 'Download this word as an image' });
  expect(button).toBeInTheDocument();
  fireEvent.click(button); // jsdom has no 2d context; this must not throw
  await waitFor(() => expect(button).toBeInTheDocument());
});

// ------------------------------------------------------ fourth board of ideas

test('a chosen sense is what the card asks about', async () => {
  const twoSenses = entry({
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          { definition: 'The common first sense.' },
          { definition: 'The one I actually mean.' },
        ],
        synonyms: [],
        antonyms: [],
      },
    ],
  });
  stubFetch((url) =>
    String(url).includes('dictionaryapi') ? mockJson([twoSenses]) : mockJson([])
  );

  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });

  const controls = screen.getAllByRole('button', { name: /Study this sense/ });
  fireEvent.click(controls[1]); // the second definition

  // Choosing a sense saves the word too, so there is something to study.
  expect(screen.getByRole('button', { name: 'Remove from saved words' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Studying this sense' })).toBeInTheDocument();
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Study' }));

  expect(screen.getByText('The one I actually mean.')).toBeInTheDocument();
  expect(screen.queryByText('The common first sense.')).not.toBeInTheDocument();
});

test('counts the saved words by box', () => {
  const words = [
    { term: 'alpha', lang: 'en' },
    { term: 'beta', lang: 'en' },
    { term: 'gamma', lang: 'en' },
  ];

  // Untouched words sit in the first box.
  expect(boxCounts(words)).toEqual([3, 0, 0, 0, 0]);

  recordAnswer('alpha', 'en', true);
  recordAnswer('beta', 'en', true);
  recordAnswer('beta', 'en', true);
  expect(boxCounts(words)).toEqual([1, 1, 1, 0, 0]);
});

test('shows the box distribution once words are saved', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  fireEvent.click(screen.getByRole('button', { name: 'Save this word' }));
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));

  expect(screen.getByText('1 word in rotation')).toBeInTheDocument();
  expect(screen.getByText('new')).toBeInTheDocument();
});

test('preferences survive a reload, together', () => {
  const { unmount } = render(<App />);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Toggle dark mode' }));
  fireEvent.change(screen.getByLabelText('Typeface'), { target: { value: 'sans' } });
  expect(document.body.className).toBe('dark font-sans');
  unmount();

  render(<App />);
  expect(document.body.className).toBe('dark font-sans');
});
