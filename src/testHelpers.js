import { act, fireEvent, screen } from '@testing-library/react';

import { resetPrimaryBreaker } from './useDictionary';

/**
 * What every file of tests here shares: a word to answer with, a way to answer
 * requests, and a way to let the app finish what it started.
 *
 * This used to sit at the top of a single 1,188-line test file. The tests
 * themselves are grouped by what they are about — lookup, failures, memory,
 * study, extras, navigation — so that the set of them reads as a list of what
 * the app guarantees.
 */

export const entry = (overrides = {}) => ({
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

export const mockJson = (payload, { ok = true, status = 200 } = {}) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(payload) });

/** Only the calls to the dictionary itself, ignoring the optional extras. */
export const dictionaryCalls = () =>
  global.fetch.mock.calls.filter(([url]) => String(url).includes('dictionaryapi.dev'));

/**
 * Which lookup sources were asked, in order. Naming them explicitly matters:
 * the page also talks to Datamuse and to Wiktionary's parse API for the extras,
 * and counting those as lookups made these assertions depend on timing.
 */
export const lookupSources = () =>
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
export const settle = () =>
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

export const search = (word) => {
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
export const stubFetch = (handler, { extras = false } = {}) => {
  global.fetch = vi.fn((url, options) => {
    const target = String(url);
    if (!extras && isExtra(target)) {
      return target.includes('api.php') ? mockJson({}) : mockJson([]);
    }
    return handler(target, options);
  });
};

/**
 * Every file of tests starts from the same clean world: a dictionary that
 * answers, nothing in storage, no source marked as down, and an empty address
 * bar. Called once at the top of each file rather than left as a side effect of
 * importing this one, so it is visible where it applies.
 */
export const startClean = () => {
  beforeEach(() => {
    stubFetch(() => mockJson([entry()]));
    window.localStorage.clear();
    resetPrimaryBreaker(); // module-level state must not leak between tests
    window.history.replaceState({}, '', '/'); // nor must the address bar
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
};

export const stubAudio = (behaviour) => {
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

export const wiktionaryPayload = {
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

export const failPrimaryThen = (wiktionaryResponse) =>
  vi.fn((url) =>
    String(url).includes('wiktionary.org')
      ? wiktionaryResponse()
      : Promise.reject(new TypeError('Failed to fetch'))
  );

export const etymologyPage = (text) =>
  mockJson({ parse: { text: `<h3>Etymology</h3><p>${text}</p>` } });
