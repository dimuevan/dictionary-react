import './Search.css'; // Make sure to create a corresponding CSS file for styling

import React, { useEffect, useRef, useState } from 'react';

import { DEFAULT_LANGUAGE } from './languages';
import { fetchCompletions } from './datamuse';

const Search = ({ onSearch, term = '', lang = DEFAULT_LANGUAGE }) => {
  const [input, setInput] = useState(term);
  const [completions, setCompletions] = useState([]);
  const [dismissed, setDismissed] = useState(true);

  // The word can also be chosen away from this box — from the address bar, a
  // recent chip, or a synonym — and the box should show what is on screen.
  useEffect(() => {
    setInput(term);
  }, [term]);

  const handleInputChange = (event) => {
    setInput(event.target.value);
    setDismissed(false);
  };

  // Completions are a convenience, not the search: they are debounced, cancelled
  // when the next keystroke arrives, English-only, and silent when unavailable.
  useEffect(() => {
    const typed = input.trim();
    if (dismissed || lang !== DEFAULT_LANGUAGE || typed.length < 2 || typed === term.trim()) {
      setCompletions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchCompletions(typed.toLowerCase(), controller.signal).then((words) => {
        if (!controller.signal.aborted) setCompletions(words);
      });
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, lang, term, dismissed]);

  const choose = (word) => {
    setCompletions([]);
    setDismissed(true);
    onSearch(word);
  };
  
  // Create a reference to the input element
  const inputRef = useRef(null);

  // After the component mounts, set focus to the input element
  useEffect(() => {
    // Check if the input element exists and if so, call its focus method
    if(inputRef.current) {
      inputRef.current.focus();
    }
  }, []); // Empty dependency array means this effect runs once after initial render

  // "/" jumps to the box and Escape empties it, the way a search tool behaves.
  // Neither fires while the reader is typing somewhere else.
  useEffect(() => {
    const handleKeyDown = (event) => {
      const active = document.activeElement;
      const typingElsewhere =
        active && active !== inputRef.current &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

      if (event.key === '/' && !typingElsewhere && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (event.key === 'Escape' && active === inputRef.current) {
        // Escape closes the suggestions first, and only then empties the box.
        setCompletions((current) => {
          if (current.length) {
            setDismissed(true);
            return [];
          }
          setInput('');
          return current;
        });
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault(); // Prevent the default form submit action
    if (input.trim()) { // Check if the input is not just whitespace
      setCompletions([]);
      setDismissed(true);
      onSearch(input);
    }
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search a word, e.g. keyboard"
        value={input}
        onChange={handleInputChange}
        aria-label="Search for a word"
      />
      <button type="submit" className="search-button" aria-label="Search">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M11.2876 21.5752C16.9693 21.5752 21.5752 16.9693 21.5752 11.2876C21.5752 5.60592 16.9693 1 11.2876 1C5.60592 1 1 5.60592 1 11.2876C1 16.9693 5.60592 21.5752 11.2876 21.5752Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18.4429 18.9772L22.4762 23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {/* A plain list of buttons, not a listbox: a listbox's children must be
          options, and buttons are already reachable and announced correctly. */}
      {completions.length > 0 && (
        <ul className="completions" aria-label="Suggestions">
          {completions.map((word) => (
            <li key={word}>
              <button type="button" className="completion" onClick={() => choose(word)}>
                {word}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};

export default Search;
