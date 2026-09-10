import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { readExtra } from './extrasCache';
import { wordOfTheDay } from './wordOfTheDay';
import {
  entry,
  etymologyPage,
  mockJson,
  search,
  settle,
  startClean,
  stubFetch,
} from './testHelpers';

/**
 * The parts that are not the definition: frequency, origin, rhymes, completions, sharing.
 *
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */
startClean();

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
  expect(screen.getByRole('heading', { name: 'origin' })).toBeInTheDocument();
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
