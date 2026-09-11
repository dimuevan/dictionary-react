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
 * A word, and what the page makes of it.
 *
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */
startClean();

test('renders the word, its definition and the play button', async () => {
  render(<App />);
  search('keyboard');

  expect(await screen.findByRole('heading', { name: 'keyboard' })).toBeInTheDocument();
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
  expect(screen.getByText('/ˈkiːbɔːd/')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Play pronunciation' })).toBeInTheDocument();
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

test('hides the play button but still shows the phonetic text when there is no audio', async () => {
  stubFetch(() =>
    mockJson([entry({ phonetics: [{ text: '/eɪ/', audio: '' }] })])
  );
  render(<App />);
  search('keyboard');

  expect(await screen.findByText('/eɪ/')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Play pronunciation' })).not.toBeInTheDocument();
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

test('encodes the search term into the request URL', async () => {
  render(<App />);
  search('  A B/C  ');

  await waitFor(() => expect(dictionaryCalls().length).toBeGreaterThan(0));
  expect(dictionaryCalls()[0][0]).toBe(
    'https://api.dictionaryapi.dev/api/v2/entries/en/a%20b%2Fc'
  );
  await settle();
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
