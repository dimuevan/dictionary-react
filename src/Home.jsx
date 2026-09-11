import './Home.css';

import { useRef, useState } from 'react';
import { buildBackup, restoreBackup } from './backup';
import { clearCachedWords, readCachedPayload, readRecentWords } from './wordCache';
import { clearFavourites, readFavourites, removeFavourite, toCsv, toTsv } from './favourites';
import { dueEntries, nextDueAt } from './studySchedule';

import { ArrowIcon, CloseIcon } from './icons';
import { DEFAULT_LANGUAGE } from './languages';
import StudyCards from './StudyCards';
import StudyProgress from './StudyProgress';
import { boxCounts } from './studySchedule';
import { clearExtras } from './extrasCache';
import useWordPreview from './useWordPreview';
import { wordOfTheDay } from './wordOfTheDay';

const RECENT_SHOWN = 5;

const firstDefinition = (payload) => {
  const meanings = payload && payload.data && payload.data[0] && payload.data[0].meanings;
  const meaning = Array.isArray(meanings) ? meanings[0] : null;
  const definition = meaning && meaning.definitions && meaning.definitions[0];
  return definition ? definition.definition : '';
};

const definitionOf = (entry) => firstDefinition(readCachedPayload(entry.term, entry.lang));

const download = (contents, filename, type) => {
  try {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    // downloads can be blocked; the collection is still on screen
  }
};

/** "in 3 days", "tomorrow" — a date is not what anyone wants to read here. */
const whenNext = (time, now = Date.now()) => {
  const days = Math.ceil((time - now) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
};

/** One word in a list, with as much of its definition as fits on the line. */
const WordRow = ({ entry, onSelect, onForget }) => (
  <li className="word-row">
    <button
      type="button"
      className="word-row-open"
      onClick={() => onSelect(entry.term, entry.lang)}
    >
      <span className="word-row-term" lang={entry.lang}>
        {entry.term}
      </span>
      {entry.lang !== DEFAULT_LANGUAGE && <span className="word-row-lang">{entry.lang}</span>}
      <span className="word-row-definition">{definitionOf(entry)}</span>
    </button>

    {onForget && (
      <button
        type="button"
        className="word-row-forget"
        aria-label={`Remove ${entry.term}`}
        onClick={() => onForget(entry)}
      >
        <CloseIcon width={15} height={15} />
      </button>
    )}
  </li>
);

/**
 * The screen before a search: a word to read today, what is due for review, and
 * the words already looked up or kept — each with enough of its definition to
 * be worth choosing, instead of a row of bare chips.
 *
 * Everything here except the word of the day comes from storage that is already
 * on the machine, so the whole screen is there before the network is.
 */
const Home = ({ onSelect }) => {
  const [recent, setRecent] = useState(() => readRecentWords(RECENT_SHOWN));
  const [saved, setSaved] = useState(() => readFavourites());
  const [studying, setStudying] = useState(false);
  const [restoreNote, setRestoreNote] = useState('');
  const fileRef = useRef(null);

  const daily = wordOfTheDay();
  const preview = useWordPreview(daily, DEFAULT_LANGUAGE);

  const due = dueEntries(saved);
  const nextAt = nextDueAt(saved);

  const handleRestore = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // let the same file be chosen twice
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try {
        payload = JSON.parse(String(reader.result));
      } catch (error) {
        setRestoreNote('That file could not be read.');
        return;
      }

      const result = restoreBackup(payload);
      if (!result) {
        setRestoreNote('That is not a Dictionearch backup.');
        return;
      }

      setRecent(readRecentWords(RECENT_SHOWN));
      setSaved(readFavourites());
      setRestoreNote(
        `Restored ${result.words} word${result.words === 1 ? '' : 's'} and ${result.favourites} saved.`
      );
    };
    reader.onerror = () => setRestoreNote('That file could not be read.');
    reader.readAsText(file);
  };

  if (studying) {
    return (
      <StudyCards
        entries={saved}
        onClose={() => setStudying(false)}
        onSelect={(term, language) => onSelect(term, language)}
      />
    );
  }

  const forget = (entry) => {
    removeFavourite(entry.term, entry.lang);
    setSaved(readFavourites());
  };

  const forgetEverything = () => {
    clearCachedWords();
    clearFavourites();
    // The origins and frequencies are keyed by word: forgetting the history has
    // to forget them too, or the words are still there.
    clearExtras();
    setRecent([]);
    setSaved([]);
  };

  return (
    <div className="home">
      <section className="card card--daily" aria-labelledby="card-daily">
        <p className="card-label" id="card-daily">
          Word of the day
        </p>

        <button type="button" className="daily-word" onClick={() => onSelect(daily)}>
          {daily}
        </button>

        {preview ? (
          <>
            <p className="daily-meta">
              {preview.phonetic && <span className="daily-phonetic">{preview.phonetic}</span>}
              {preview.partOfSpeech && <span className="daily-pos">{preview.partOfSpeech}</span>}
            </p>
            <p className="daily-definition">{preview.definition}</p>
          </>
        ) : (
          <p className="daily-definition is-waiting" aria-hidden="true">
            <span className="line" />
            <span className="line" />
          </p>
        )}

        <button type="button" className="card-action" onClick={() => onSelect(daily)}>
          Read the entry
          <ArrowIcon width={17} height={17} />
        </button>
      </section>

      <section className="card card--review" aria-labelledby="card-review">
        <p className="card-label" id="card-review">
          Review
        </p>

        {saved.length === 0 ? (
          <p className="card-empty">
            Star a word while you are reading it and it waits here, on a schedule that brings
            it back just as you are about to forget it.
          </p>
        ) : (
          <>
            <p className="review-count">
              <strong>{due.length || 'Nothing'}</strong>
              {due.length ? ` ${due.length === 1 ? 'word' : 'words'} due` : ' due right now'}
            </p>

            {due.length > 0 ? (
              <button type="button" className="pill-button" onClick={() => setStudying(true)}>
                Study {due.length === 1 ? '1 word' : `${due.length} words`}
              </button>
            ) : (
              <p className="card-empty">
                {nextAt ? `The next one comes back ${whenNext(nextAt)}.` : 'Nothing scheduled yet.'}
              </p>
            )}

            {/* The card has already said what to do, so the footnote about how
                the boxes work would only be in the way here. */}
            <StudyProgress counts={boxCounts(saved)} note={false} />
          </>
        )}
      </section>

      <section className="card card--recent" aria-labelledby="card-recent">
        <p className="card-label" id="card-recent">
          Recent
          {recent.length > 0 && <span className="card-count">{recent.length}</span>}
        </p>

        {recent.length === 0 ? (
          <p className="card-empty">Nothing looked up yet.</p>
        ) : (
          <ul className="word-rows">
            {recent.map((entry) => (
              <WordRow key={`${entry.lang}:${entry.term}`} entry={entry} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </section>

      <section className="card card--saved" aria-labelledby="card-saved">
        <p className="card-label" id="card-saved">
          Saved
          {saved.length > 0 && <span className="card-count">{saved.length}</span>}
        </p>

        {saved.length === 0 ? (
          <p className="card-empty">The words you star while reading collect here.</p>
        ) : (
          <ul className="word-rows">
            {saved.slice(0, RECENT_SHOWN).map((entry) => (
              <WordRow
                key={`${entry.lang}:${entry.term}`}
                entry={entry}
                onSelect={onSelect}
                onForget={forget}
              />
            ))}
          </ul>
        )}

        {saved.length > 0 && (
          <div className="card-tools">
            <button
              type="button"
              className="quiet-button"
              onClick={() =>
                download(toCsv(saved, definitionOf), 'dictionearch-words.csv', 'text/csv;charset=utf-8')
              }
            >
              CSV
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={() =>
                download(
                  toTsv(saved, definitionOf),
                  'dictionearch-anki.tsv',
                  'text/tab-separated-values;charset=utf-8'
                )
              }
            >
              Anki
            </button>
          </div>
        )}
      </section>

      <div className="home-utilities">
        <button
          type="button"
          className="quiet-button"
          onClick={() =>
            download(
              JSON.stringify(buildBackup(), null, 2),
              'dictionearch-backup.json',
              'application/json'
            )
          }
        >
          Back up
        </button>

        <button type="button" className="quiet-button" onClick={() => fileRef.current?.click()}>
          Restore
        </button>

        {(recent.length > 0 || saved.length > 0) && (
          <button type="button" className="quiet-button" onClick={forgetEverything}>
            Clear
          </button>
        )}
      </div>

      {/* Outside the row: an input between two buttons breaks the separators. */}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        aria-label="Restore from a backup file"
        onChange={handleRestore}
      />

      {restoreNote && (
        <p className="home-note" role="status">
          {restoreNote}
        </p>
      )}
    </div>
  );
};

export default Home;
