import './WordDisplay.css'; // CSS file for styling

import React, { useEffect, useState } from 'react';

import { DEFAULT_LANGUAGE } from './languages';
import { fetchEtymology } from './etymology';
import { fetchFrequency, fetchRelatedWords } from './datamuse';
import { downloadWordCard } from './wordCardImage';
import { isFavourite, setStudySense, studySenseOf, toggleFavourite } from './favourites';
import { shareUrlFor } from './urlTerm';

/**
 * Flattens every entry into one group per part of speech, in the order the API
 * returns them. Nouns and verbs used to be special-cased, which meant three
 * near-identical blocks of JSX that drifted apart over time.
 */
const groupMeanings = (entries) => {
  const groups = new Map();

  entries.forEach((entry) => {
    (entry.meanings || []).forEach((meaning) => {
      const partOfSpeech = meaning.partOfSpeech;
      if (!partOfSpeech) return;

      if (!groups.has(partOfSpeech)) {
        groups.set(partOfSpeech, { partOfSpeech, definitions: [], synonyms: [], antonyms: [] });
      }
      const group = groups.get(partOfSpeech);

      (meaning.definitions || []).forEach((definition) => {
        group.definitions.push({
          definition: definition.definition,
          example: typeof definition.example === 'string' ? definition.example : '',
        });
      });

      // The API usually sends these, but a missing key used to throw mid-render.
      group.synonyms.push(...(meaning.synonyms || []));
      group.antonyms.push(...(meaning.antonyms || []));
    });
  });

  return [...groups.values()].map((group) => ({
    ...group,
    synonyms: [...new Set(group.synonyms)],
    antonyms: [...new Set(group.antonyms)],
  }));
};

/**
 * Related words are entry points, not decoration: each one starts a new lookup,
 * which turns a single entry into something you can wander through.
 */
const renderWords = (words, onSelectWord) =>
  words.map((word) => (
    <button
      key={word}
      type="button"
      className="keyword-button"
      onClick={() => onSelectWord(word)}
    >
      {word}
    </button>
  ));

/**
 * The API often carries more than one recording of the same word, and the
 * region is only ever stated in the file name (…-us.mp3, …-uk.mp3). Offering
 * one of them silently throws away data that already arrived.
 */
const REGIONS = [
  [/[-_]us\.(mp3|ogg|wav)/i, 'US'],
  [/[-_]uk\.(mp3|ogg|wav)/i, 'UK'],
  [/[-_]au\.(mp3|ogg|wav)/i, 'AU'],
  [/[-_]ca\.(mp3|ogg|wav)/i, 'CA'],
];

const collectPronunciations = (phonetics) => {
  const seen = new Set();

  return phonetics
    .filter((phonetic) => {
      if (!phonetic.audio || seen.has(phonetic.audio)) return false;
      seen.add(phonetic.audio);
      return true;
    })
    .map((phonetic, index) => {
      const match = REGIONS.find(([pattern]) => pattern.test(phonetic.audio));
      return {
        audio: phonetic.audio,
        text: phonetic.text || '',
        label: match ? match[1] : `Audio ${index + 1}`,
      };
    });
};

// Words like "set" carry dozens of senses; showing them all turns the entry
// into a wall. The rest stay one click away.
const COLLAPSED_DEFINITIONS = 3;

const visibleDefinitions = (group, expanded) =>
  expanded[group.partOfSpeech]
    ? group.definitions
    : group.definitions.slice(0, COLLAPSED_DEFINITIONS);

const firstDefinitionOf = (groups) => {
  const group = groups[0];
  return group && group.definitions[0] ? group.definitions[0].definition : '';
};

const sourceHost = (urls) => {
  try {
    return Array.isArray(urls) && urls[0] ? new URL(urls[0]).hostname : '';
  } catch (error) {
    return '';
  }
};

const WordDisplay = ({ wordData, onSelectWord = () => {}, lang = DEFAULT_LANGUAGE }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [frequency, setFrequency] = useState(null);
  const [etymology, setEtymology] = useState(null);
  const [related, setRelated] = useState({ rhymes: [], similar: [] });
  const [expanded, setExpanded] = useState({});

  const headword = wordData.data[0].word;
  const [starred, setStarred] = useState(() => isFavourite(headword, lang));
  const [studySense, setStudySenseState] = useState(() => studySenseOf(headword, lang));

  useEffect(() => {
    setStarred(isFavourite(headword, lang));
    setStudySenseState(studySenseOf(headword, lang));
    setCopied(false);
    setSelected(0);
  }, [headword, lang]);

  // Two extras that enrich an entry without being part of it: neither blocks
  // the definition, and neither shows anything when it cannot be had.
  useEffect(() => {
    setFrequency(null);
    if (lang !== DEFAULT_LANGUAGE) return undefined;

    const controller = new AbortController();
    fetchFrequency(headword, controller.signal).then((result) => {
      if (!controller.signal.aborted) setFrequency(result);
    });

    return () => controller.abort();
  }, [headword, lang]);

  useEffect(() => {
    setRelated({ rhymes: [], similar: [] });
    setExpanded({});
    if (lang !== DEFAULT_LANGUAGE) return undefined;

    const controller = new AbortController();
    fetchRelatedWords(headword, controller.signal).then((result) => {
      if (!controller.signal.aborted) setRelated(result);
    });

    return () => controller.abort();
  }, [headword, lang]);

  useEffect(() => {
    setEtymology(null);
    const controller = new AbortController();

    fetchEtymology(headword, lang, controller.signal).then((text) => {
      if (!controller.signal.aborted) setEtymology(text);
    });

    return () => controller.abort();
  }, [headword, lang]);

  const handleStar = () => {
    setStarred(toggleFavourite(headword, lang));
  };

  const chooseSense = (definition) => {
    setStudySense(headword, lang, definition);
    setStudySenseState(definition);
    setStarred(true);
  };

  const handleShareImage = () => {
    downloadWordCard({
      word: headword,
      phonetic: phoneticText,
      definition: firstDefinitionOf(meaningGroups),
      source: sourceHost(wordData.sourceUrls),
    });
  };

  const handleCopy = async () => {
    const url = shareUrlFor(headword, lang);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // clipboard permission denied or unavailable; nothing else to do
    }
  };

  // Function to play audio pronunciation
  const playAudio = (audioUrl) => {
    const audio = new Audio(audioUrl);
    setIsPlaying(true);
    audio.onended = () => setIsPlaying(false); // Reset the state after the audio has finished playing
    audio.onerror = () => setIsPlaying(false);

    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(() => setIsPlaying(false));
    }
  };

  const entries = wordData.data;
  const meaningGroups = groupMeanings(entries);

  // One flat list of phonetics across every entry: the first with audio drives
  // the play button, and the phonetic text falls back to any entry that has one.
  const phonetics = entries.flatMap((entry) => entry.phonetics || []);
  const pronunciations = collectPronunciations(phonetics);
  const pronunciation = pronunciations[selected] || pronunciations[0];
  const phoneticText =
    (pronunciation && pronunciation.text) ||
    phonetics.find((phonetic) => phonetic.text)?.text ||
    entries.find((entry) => entry.phonetic)?.phonetic ||
    '';

  const play = (index) => {
    setSelected(index);
    playAudio(pronunciations[index].audio);
  };

  return (
    <div className="word-display">
      <div className="word-header">
        <div className="word-texts">
          <h2 className="word-title">{entries[0].word}</h2>
          {phoneticText && (
            <div className="phonetics">
              <div className="phonetic-text">{phoneticText}</div>
            </div>
          )}

          {frequency && (
            <p className={`frequency is-${frequency.label}`}>
              {frequency.label}
              <span className="frequency-detail">
                {' '}· {frequency.perMillion.toFixed(2)} per million words
              </span>
            </p>
          )}

          {pronunciations.length > 1 && (
            <div className="accents" role="group" aria-label="Pronunciations">
              {pronunciations.map((option, index) => (
                <button
                  key={option.audio}
                  type="button"
                  className={`accent ${index === selected ? 'is-selected' : ''}`}
                  aria-pressed={index === selected}
                  onClick={() => play(index)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Only rendered when a recording actually exists */}
        <div className="word-actions">
          <button
            type="button"
            className={`icon-button ${starred ? 'is-on' : ''}`}
            onClick={handleStar}
            aria-pressed={starred}
            aria-label={starred ? 'Remove from saved words' : 'Save this word'}
          >
            {starred ? '★' : '☆'}
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={handleCopy}
            aria-label="Copy link to this word"
          >
            {copied ? '✓' : '⧉'}
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={handleShareImage}
            aria-label="Download this word as an image"
          >
            ⬇
          </button>

          {pronunciation && (
            <button
              type="button"
              className={`audio-button ${isPlaying ? 'is-playing' : ''}`}
              onClick={() => play(pronunciations.indexOf(pronunciation))}
              aria-label="Play pronunciation"
            >
              <span className="play-icon" aria-hidden="true"></span>
            </button>
          )}
        </div>
      </div>

      {meaningGroups.map((group) => (
        <div key={group.partOfSpeech} className="meanings-section">
          <h3>
            <span>
              {group.partOfSpeech.charAt(0).toUpperCase() + group.partOfSpeech.slice(1)}
            </span>
          </h3>
          <p className='subtitle'>Meaning</p>

          <ul>
            {visibleDefinitions(group, expanded).map((def, index) => (
              <li className='meanings--definition' key={`${group.partOfSpeech}-${index}`}>
                {def.definition}
                {def.example && (
                  <span className='meanings--example'>"{def.example}"</span>
                )}
                <button
                  type="button"
                  className={`sense-button ${studySense === def.definition ? 'is-chosen' : ''}`}
                  onClick={() => chooseSense(def.definition)}
                  aria-pressed={studySense === def.definition}
                >
                  {studySense === def.definition ? 'Studying this sense' : 'Study this sense'}
                </button>
              </li>
            ))}
          </ul>

          {group.definitions.length > COLLAPSED_DEFINITIONS && (
            <button
              type="button"
              className="show-all"
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [group.partOfSpeech]: !current[group.partOfSpeech],
                }))
              }
            >
              {expanded[group.partOfSpeech]
                ? 'Show fewer'
                : `Show all ${group.definitions.length} definitions`}
            </button>
          )}

          {group.synonyms.length > 0 && (
            <div className="synonyms">
              <p className='subtitle'>Synonyms</p>
              <span className='keywords'>{renderWords(group.synonyms, onSelectWord)}</span>
            </div>
          )}

          {group.antonyms.length > 0 && (
            <div className="antonyms">
              <p className='subtitle'>Antonyms</p>
              <span className='keywords'>{renderWords(group.antonyms, onSelectWord)}</span>
            </div>
          )}
        </div>
      ))}

      {(related.similar.length > 0 || related.rhymes.length > 0) && (
        <div className="related-section">
          {related.similar.length > 0 && (
            <div className="synonyms">
              <p className='subtitle'>Similar in meaning</p>
              <span className='keywords'>{renderWords(related.similar, onSelectWord)}</span>
            </div>
          )}
          {related.rhymes.length > 0 && (
            <div className="synonyms">
              <p className='subtitle'>Rhymes</p>
              <span className='keywords'>{renderWords(related.rhymes, onSelectWord)}</span>
            </div>
          )}
        </div>
      )}

      {etymology && (
        <div className="etymology-section">
          <p className='subtitle'>Origin</p>
          <p className="etymology-text">{etymology}</p>
        </div>
      )}

      {/* Display source if available */}
      {wordData.sourceUrls && wordData.sourceUrls.length > 0 && (
        <div className="source">
          <strong>Source</strong>
          {wordData.sourceUrls.map((url, index) => (
            <p key={index}>
              <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

export default WordDisplay;
