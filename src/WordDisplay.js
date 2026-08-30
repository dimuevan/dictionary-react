import './WordDisplay.css'; // CSS file for styling

import React, { useState } from 'react';

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

const WordDisplay = ({ wordData }) => {
  const [isPlaying, setIsPlaying] = useState(false);

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
  const pronunciation = phonetics.find((phonetic) => phonetic.audio);
  const phoneticText =
    pronunciation?.text ||
    phonetics.find((phonetic) => phonetic.text)?.text ||
    entries.find((entry) => entry.phonetic)?.phonetic ||
    '';

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
        </div>

        {/* Only rendered when a recording actually exists */}
        {pronunciation && (
          <button
            type="button"
            className={`audio-button ${isPlaying ? 'is-playing' : ''}`}
            onClick={() => playAudio(pronunciation.audio)}
            aria-label="Play pronunciation"
          >
            <span className="play-icon" aria-hidden="true"></span>
          </button>
        )}
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
            {group.definitions.map((def, index) => (
              <li className='meanings--definition' key={`${group.partOfSpeech}-${index}`}>
                {def.definition}
                {def.example && (
                  <span className='meanings--example'>"{def.example}"</span>
                )}
              </li>
            ))}
          </ul>

          {group.synonyms.length > 0 && (
            <div className="synonyms">
              <p className='subtitle'>Synonyms</p>
              <span className='keywords'>{group.synonyms.join(', ')}</span>
            </div>
          )}

          {group.antonyms.length > 0 && (
            <div className="antonyms">
              <p className='subtitle'>Antonyms</p>
              <span className='keywords'>{group.antonyms.join(', ')}</span>
            </div>
          )}
        </div>
      ))}

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
