import './WordDisplay.css'; // CSS file for styling

import React, { useState } from 'react';

const WordDisplay = ({ wordData }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Function to play audio pronunciation
  const playAudio = (audioUrl) => {
    const audio = new Audio(audioUrl);
    setIsPlaying(true);
    audio.play();
    audio.onended = () => setIsPlaying(false); // Reset the state after the audio has finished playing
  };

 // Utility to extract and categorize meanings by part of speech, including examples for definitions
const categorizeMeanings = (data) => {
  const categories = {
    noun: {
      definitions: [],
      synonyms: [],
      antonyms: []
    },
    verb: {
      definitions: [],
      synonyms: [],
      antonyms: []
    },
    others: []
  };

  data.forEach(dataItem => {

    if (dataItem.meanings) {

      const meanings = dataItem.meanings;

      meanings.forEach(meaning => {
        if (meaning.partOfSpeech === 'noun' || meaning.partOfSpeech === 'verb') {
          // Process each definition to include examples
          meaning.definitions.forEach(definition => {
            const defWithExamples = {
              definition: definition.definition,
              example: definition.example || [] // Ensure examples array exists even if it's empty
            };

            // Push the definition with examples to the appropriate category
            if (meaning.partOfSpeech === 'noun') {
              categories.noun.definitions.push(defWithExamples);
            } else if (meaning.partOfSpeech === 'verb') {
              categories.verb.definitions.push(defWithExamples);
            }
          });

          // Process synonyms and antonyms as before
          if (meaning.partOfSpeech === 'noun') {
            categories.noun.synonyms.push(...meaning.synonyms);
            categories.noun.antonyms.push(...meaning.antonyms);
          } else if (meaning.partOfSpeech === 'verb') {
            categories.verb.synonyms.push(...meaning.synonyms);
            categories.verb.antonyms.push(...meaning.antonyms);
          }
        } else {
          categories.others.push(meaning);
        }
      });
      
    }
    
  });

  // Ensure unique synonyms and antonyms
  categories.noun.synonyms = [...new Set(categories.noun.synonyms)];
  categories.noun.antonyms = [...new Set(categories.noun.antonyms)];
  categories.verb.synonyms = [...new Set(categories.verb.synonyms)];
  categories.verb.antonyms = [...new Set(categories.verb.antonyms)];

  return categories;
};


  // Categorized meanings
  const { noun, verb, others } = categorizeMeanings(wordData.data);

  const allIPAtexts = wordData.data.map((wordDataItem) =>
    wordDataItem.phonetics?.find(phonetic => phonetic.text)
  );

  const allPhoneticWithAudio = wordData.data.map((wordDataItem) =>
    wordDataItem.phonetics?.find(phonetic => phonetic.audio)
  );

  return (
    <div className="word-display">
      {wordData && (
        console.log(others),
        <>

          <div className="word-header">
            <div className="word-texts">
              <h2 className="word-title">{wordData.data[0].word}</h2>
              {
                allPhoneticWithAudio && allPhoneticWithAudio.length > 0 ? (
                  allPhoneticWithAudio[0] && allPhoneticWithAudio[0].text && (
                    <div className="phonetics">
                      <div className="phonetic-text">{allPhoneticWithAudio[0].text}</div>
                    </div>
                  )
                ) : allIPAtexts && allIPAtexts.length > 0 ? (
                  <div className="phonetics">
                    <div className="phonetic-text">{allIPAtexts[0].text}</div>
                  </div>
                ) : null
              }
            </div>
            {/* Display audio button if audio URL is available */}
            {allPhoneticWithAudio && (
              <div className={`audio-button ${isPlaying ? 'is-playing' : ''}`} onClick={() => playAudio(allPhoneticWithAudio[0].audio)}>
                <div className="play-icon" aria-label="Listen to pronunciation"></div>
              </div>
            )}
          </div>

          {/* Display noun meanings, synonyms, and antonyms */}
          {noun.definitions.length > 0 && (
            <div className="meanings-section">
              <h3>
                <span>Noun</span>
              </h3>
              <p className='subtitle'>Meaning</p>
              {/* Definitions */}
              <ul>
                {noun.definitions.map((def, index) => (
                  <li className='meanings--definition' key={index}>
                    {def.definition}
                    {def.example != '' && (
                      <span className='meanings--example'>"{def.example}"</span>
                    )}
                  </li>
                ))}
              </ul>
              {/* Synonyms */}
              {noun.synonyms.length > 0 && (
                <div className="synonyms">
                  <p className='subtitle'>Synonyms</p>
                  <span className='keywords'>{noun.synonyms.join(', ')}</span>
                </div>
              )}

              {/* Antonyms */}
              {noun.antonyms.length > 0 && (
                <div className="antonyms">
                  <p className='subtitle'>Antonyms</p>
                  <span className='keywords'>{noun.antonyms.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Display verb meanings, synonyms, and antonyms */}
          {verb.definitions.length > 0 && (
            <div className="meanings-section">
              <h3>
                <span>Verb</span>
              </h3>
              <p className='subtitle'>Meaning</p>
              {/* Definitions */}
              <ul>
                {verb.definitions.map((def, index) => (
                  <li className='meanings--definition' key={index}>
                    {def.definition}
                    {def.example != '' && (
                      <span className='meanings--example'>"{def.example}"</span>
                    )}
                  </li>
                ))}
              </ul>
              {/* Synonyms */}
              {verb.synonyms.length > 0 && (
                <div className="synonyms">
                  <p className='subtitle'>Synonyms</p>
                  <span className='keywords'>{verb.synonyms.join(', ')}</span>
                </div>
              )}

              {/* Antonyms */}
              {verb.antonyms.length > 0 && (
                <div className="antonyms">
                  <p className='subtitle'>Antonyms</p>
                  <span className='keywords'>{verb.antonyms.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Display meanings for other parts of speech */}
          {others.map((other, index) => (
            <div key={index} className="meanings-section">
              <h3>
                <span>{other.partOfSpeech.charAt(0).toUpperCase() + other.partOfSpeech.slice(1)}</span>
              </h3>
              <p className='subtitle'>Meaning</p>
              <ul>
                {other.definitions.map((def, index) => (
                  <li key={index}>
                    {def.definition}
                    {def.example != '' && (
                      <span className='meanings--example'>"{def.example}"</span>
                    )}
                  </li>
                ))}
              </ul>
              {/* Other synonyms and antonyms can be added here if necessary */}
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
          
        </>
      )}
    </div>
  );
};

export default WordDisplay;