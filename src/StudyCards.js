import './StudyCards.css';

import React, { useMemo, useState } from 'react';

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

/**
 * The definition first, the word second. Every card is built from an entry
 * already in the cache, so studying works with no network at all — and a saved
 * word with nothing cached is simply left out rather than shown blank.
 */
const StudyCards = ({ entries, onClose, onSelect }) => {
  const cards = useMemo(
    () =>
      shuffle(
        entries
          .map((entry) => ({
            ...entry,
            definition: firstDefinition(readCachedPayload(entry.term, entry.lang)),
          }))
          .filter((card) => card.definition)
      ),
    [entries]
  );

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (!cards.length) {
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

  const card = cards[index];

  const next = () => {
    setRevealed(false);
    setIndex((current) => (current + 1) % cards.length);
  };

  return (
    <section className="study" aria-label="Study cards">
      <p className="study-progress">
        {index + 1} / {cards.length}
      </p>

      <p className="study-definition">{card.definition}</p>

      {revealed ? (
        <p className="study-answer">
          <button type="button" className="study-word" onClick={() => onSelect(card.term, card.lang)}>
            {card.term}
          </button>
        </p>
      ) : (
        <button type="button" className="retry-button" onClick={() => setRevealed(true)}>
          Show the word
        </button>
      )}

      <div className="study-actions">
        <button type="button" className="chip" onClick={next}>
          Next card
        </button>
        <button type="button" className="recent-clear" onClick={onClose}>
          Done
        </button>
      </div>
    </section>
  );
};

export default StudyCards;
