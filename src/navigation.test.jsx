import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
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
 * The address bar, the title, the back button and the preferences.
 *
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */
startClean();

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

test('preferences survive a reload, together', () => {
  const { unmount } = render(<App />);

  fireEvent.click(screen.getByRole('checkbox', { name: 'Toggle dark mode' }));
  fireEvent.change(screen.getByLabelText('Typeface'), { target: { value: 'sans' } });
  expect(document.body.className).toBe('dark font-sans');
  unmount();

  render(<App />);
  expect(document.body.className).toBe('dark font-sans');
});
