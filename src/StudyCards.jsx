import './StudyCards.css';

import { useMemo, useState } from 'react';
import { dueEntries, nextDueAt, recordAnswer, stateFor } from './studySchedule';

import { readCachedPayload } from './wordCache';

const firstDefinition = (payload) => {
  const meanings = payload && payload.data && payload.data[0] && payload.data[0].meanings;
  const meaning = Array.isArray(meanings) ? meanings[0] : null;
  const definition = meaning && meaning.definitions && meaning.definitions[0];
  return definition ? definition.definition : '';
};

const shuffle = (items) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

const whenDue = (timestamp) => {
  const days = Math.round((timestamp - Date.now()) / 86400000);
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
};

/**
 * The definition first, the word second. Every card is built from an entry
 * already in the cache, so studying works with no network at all — and a saved
 * word with nothing cached is simply left out rather than shown blank.
 *
 * Which cards come up is decided by the Leitner boxes: only what is due, hardest
 * first. Answering is what moves a word along, so the buttons are the point.
 */
const StudyCards = ({ entries, onClose, onSelect }) => {
  const studiable = useMemo(
    () =>
      entries
        .map((entry) => ({
          ...entry,
          // The sense the reader picked wins over whichever came first.
          definition: entry.definition || firstDefinition(readCachedPayload(entry.term, entry.lang)),
        }))
        .filter((card) => card.definition),
    [entries]
  );

  const [queue, setQueue] = useState(() => shuffle(dueEntries(studiable)));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(0);

  if (!studiable.length) {
    return (
      <div className="study">
        <p className="study-empty">
          None of your saved words has a definition stored yet. Open a few, then come back.
        </p>
        <button type="button" className="retry-button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  if (!queue.length || index >= queue.length) {
    const upcoming = nextDueAt(studiable);

    return (
      <div className="study">
        <p className="study-empty">
          {answered > 0
            ? `Done — ${answered} card${answered === 1 ? '' : 's'} reviewed.`
            : 'Nothing is due right now.'}
          {upcoming ? ` Next review ${whenDue(upcoming)}.` : ''}
        </p>
        <div className="study-actions">
          <button
            type="button"
            className="chip"
            onClick={() => {
              setQueue(shuffle(studiable));
              setIndex(0);
              setRevealed(false);
            }}
          >
            Review everything anyway
          </button>
          <button type="button" className="quiet-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const card = queue[index];
  const box = stateFor(card.term, card.lang).box;

  const answer = (knewIt) => {
    recordAnswer(card.term, card.lang, knewIt);
    setAnswered((current) => current + 1);
    setRevealed(false);
    setIndex((current) => current + 1);
  };

  return (
    <section className="study" aria-label="Study cards">
      <p className="study-progress">
        {index + 1} / {queue.length} · box {box}
      </p>

      <p className="study-definition">{card.definition}</p>

      {revealed ? (
        <>
          <p className="study-answer">
            <button
              type="button"
              className="study-word"
              onClick={() => onSelect(card.term, card.lang)}
            >
              {card.term}
            </button>
          </p>
          <div className="study-actions">
            <button type="button" className="answer-button" onClick={() => answer(false)}>
              Not yet
            </button>
            <button type="button" className="answer-button is-known" onClick={() => answer(true)}>
              I knew it
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="pill-button" onClick={() => setRevealed(true)}>
          Show the word
        </button>
      )}

      <button type="button" className="quiet-button" onClick={onClose}>
        Done
      </button>
    </section>
  );
};

export default StudyCards;
