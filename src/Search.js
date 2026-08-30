import './Search.css'; // Make sure to create a corresponding CSS file for styling

import React, { useEffect, useRef, useState } from 'react';

const Search = ({ onSearch }) => {
  const [input, setInput] = useState('');

  const handleInputChange = (event) => {
    setInput(event.target.value);
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

  const handleSubmit = (event) => {
    event.preventDefault(); // Prevent the default form submit action
    if (input.trim()) { // Check if the input is not just whitespace
      onSearch(input);
    }
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder=""
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
    </form>
  );
};

export default Search;
