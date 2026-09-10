const SCHEDULE_KEY = 'dictionearch-study';

/**
 * A Leitner box per word: get it right and it moves up a box and comes back
 * later; get it wrong and it drops to the first box and comes back today. The
 * point of the boxes is that time is spent on the words that need it.
 */
const INTERVAL_DAYS = [0, 1, 3, 7, 21];
const MAX_BOX = INTERVAL_DAYS.length;
const MS_PER_DAY = 86400000;

const keyFor = (term, lang) => `${lang}:${term}`;

const readAll = () => {
  try {
    const raw = window.localStorage.getItem(SCHEDULE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
};

const persist = (all) => {
  try {
    window.localStorage.setItem(SCHEDULE_KEY, JSON.stringify(all));
  } catch (error) {
    // the schedule is a convenience; losing it costs a little repetition
  }
};

export const stateFor = (term, lang) => readAll()[keyFor(term, lang)] || { box: 1, dueAt: 0 };

export const recordAnswer = (term, lang, knewIt, now = Date.now()) => {
  const all = readAll();
  const current = all[keyFor(term, lang)] || { box: 1 };
  const box = knewIt ? Math.min(current.box + 1, MAX_BOX) : 1;

  const next = { box, dueAt: now + INTERVAL_DAYS[box - 1] * MS_PER_DAY };
  all[keyFor(term, lang)] = next;
  persist(all);

  return next;
};

/** Words waiting for review, the most overdue first. */
export const dueEntries = (entries, now = Date.now()) => {
  const all = readAll();

  return entries
    .map((entry) => ({ entry, state: all[keyFor(entry.term, entry.lang)] || { box: 1, dueAt: 0 } }))
    .filter(({ state }) => (state.dueAt || 0) <= now)
    .sort((a, b) => (a.state.dueAt || 0) - (b.state.dueAt || 0))
    .map(({ entry }) => entry);
};

export const nextDueAt = (entries) => {
  const all = readAll();
  const times = entries
    .map((entry) => (all[keyFor(entry.term, entry.lang)] || {}).dueAt || 0)
    .filter(Boolean);

  return times.length ? Math.min(...times) : 0;
};

export const clearSchedule = () => {
  try {
    window.localStorage.removeItem(SCHEDULE_KEY);
  } catch (error) {
    // nothing to do
  }
};

export { SCHEDULE_KEY, INTERVAL_DAYS };

/** How many of these words sit in each box, lowest first. */
export const boxCounts = (entries) => {
  const all = readAll();
  const counts = INTERVAL_DAYS.map(() => 0);

  entries.forEach((entry) => {
    const state = all[keyFor(entry.term, entry.lang)];
    const box = state && state.box ? state.box : 1;
    counts[Math.min(Math.max(box, 1), counts.length) - 1] += 1;
  });

  return counts;
};
