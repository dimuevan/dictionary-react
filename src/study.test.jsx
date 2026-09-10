import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { boxCounts, dueEntries, recordAnswer } from './studySchedule';
import {
  entry,
  mockJson,
  search,
  startClean,
  stubFetch,
} from './testHelpers';

/**
 * The flashcards and the schedule behind them.
 *
 * Each test here locks down a bug that shipped at some point: they are the
 * scenarios that broke, written down so they cannot break again silently.
 */
startClean();

test('study cards ask for the word behind a definition', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  fireEvent.click(screen.getByRole('button', { name: 'Save this word' }));
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Study \d+ words?$/ }));

  // The definition is shown first; the word is the answer.
  expect(screen.getByText('A set of keys.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'keyboard' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show the word' }));
  expect(screen.getByRole('button', { name: 'keyboard' })).toBeInTheDocument();
});

// ------------------------------------------------------- third board of ideas

test('a card answered correctly leaves the queue', async () => {
  const { unmount } = render(<App />);
  search('keyboard');
  await screen.findByRole('heading', { name: 'keyboard' });
  fireEvent.click(screen.getByRole('button', { name: 'Save this word' }));
  unmount();

  window.history.replaceState({}, '', '/');
  render(<App />);
  fireEvent.click(await screen.findByRole('tab', { name: /Saved/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Study \d+ words?$/ }));

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
  fireEvent.click(screen.getByRole('button', { name: /^Study \d+ words?$/ }));

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
