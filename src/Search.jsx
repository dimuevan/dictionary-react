import './Search.css'; // Make sure to create a corresponding CSS file for styling

import { useEffect, useRef, useState } from 'react';

import { DEFAULT_LANGUAGE } from './languages';
import { fetchCompletions } from './datamuse';

const LISTBOX_ID = 'search-completions';
const optionId = (index) => `${LISTBOX_ID}-option-${index}`;

const Search = ({ onSearch, term = '', lang = DEFAULT_LANGUAGE }) => {
  const [input, setInput] = useState(term);
  const [completions, setCompletions] = useState([]);
  const [dismissed, setDismissed] = useState(true);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);

  const open = completions.length > 0;

  // The word can also be chosen away from this box — from the address bar, a
  // recent chip, or a synonym — and the box should show what is on screen.
  useEffect(() => {
    setInput(term);
  }, [term]);

  const handleInputChange = (event) => {
    setInput(event.target.value);
    setDismissed(false);
    setActive(-1);
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
        if (!controller.signal.aborted) {
          setCompletions(words);
          setActive(-1);
        }
      });
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, lang, term, dismissed]);

  const close = () => {
    setCompletions([]);
    setDismissed(true);
    setActive(-1);
  };

  const choose = (word) => {
    close();
    onSearch(word);
  };

  // After the component mounts, set focus to the input element
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // "/" jumps to the box from anywhere, unless the reader is typing in another
  // field. Everything else is handled on the input itself, where it belongs.
  useEffect(() => {
    const handleShortcut = (event) => {
      const focused = document.activeElement;
      const typingElsewhere =
        focused && focused !== inputRef.current &&
        (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable);

      if (event.key === '/' && !typingElsewhere && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  /** Arrow keys walk the list, Enter takes the highlighted word, Escape backs out. */
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setActive((current) => (current + 1) % completions.length);
      return;
    }

    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? completions.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault(); // the highlighted word wins over submitting the box
      choose(completions[active]);
      return;
    }

    if (event.key === 'Escape') {
      // Escape closes the suggestions first, and only then empties the box.
      if (open) close();
      else setInput('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault(); // Prevent the default form submit action
    if (input.trim()) { // Check if the input is not just whitespace
      close();
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
        onKeyDown={handleKeyDown}
        aria-label="Search for a word"
        role="combobox"
        aria-expanded={open}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
      />
      <button type="submit" className="search-button" aria-label="Search">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M11.2876 21.5752C16.9693 21.5752 21.5752 16.9693 21.5752 11.2876C21.5752 5.60592 16.9693 1 11.2876 1C5.60592 1 1 5.60592 1 11.2876C1 16.9693 5.60592 21.5752 11.2876 21.5752Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M18.4429 18.9772L22.4762 23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* A real listbox this time: the options are options, and the input points
          at the highlighted one with aria-activedescendant. */}
      <ul
        className="completions"
        id={LISTBOX_ID}
        role="listbox"
        aria-label="Suggestions"
        hidden={!open}
      >
        {completions.map((word, index) => (
          <li
            key={word}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className={`completion ${index === active ? 'is-active' : ''}`}
            onMouseDown={(event) => event.preventDefault()} // keep focus in the box
            onClick={() => choose(word)}
            onMouseEnter={() => setActive(index)}
          >
            {word}
          </li>
        ))}
      </ul>
    </form>
  );
};

export default Search;
