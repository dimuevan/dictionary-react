import './App.css'; // Your main CSS file

import React, { useEffect, useState } from 'react';

import Header from './Header';
import Search from './Search';
import WordDisplay from './WordDisplay';

const App = () => {
  const [theme, setTheme] = useState('light');
  const [searchTerm, setSearchTerm] = useState('');
  const [wordData, setWordData] = useState(null);
  const [error, setError] = useState("");
  const [showErrorClass, setShowErrorClass] = useState(false);

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  const handleSearch = (query) => {
    setSearchTerm(query);
  };

  // Effect to apply class to body element
  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  useEffect(() => {
    if (searchTerm) {
      // Reset states before a new request
      setWordData(null);
      setError(null);

      // Define the function that will fetch the data
      const fetchData = async () => {
        try {
          const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${searchTerm}`);
          if (!response.ok) {
            // Instead of just 'Word not found', you could customize this based on response.status
            throw new Error(response.status === 404 ? 'Word not found' : 'An error occurred');
          }
          const data = await response.json();
          // Ensure data is in the expected format before attempting to access .sourceUrls
          if (data && Array.isArray(data) && data.length > 0) {
            const sources = data[0].sourceUrls; // Ensure this key exists in your actual API response
            setWordData({ data: data, sourceUrls: sources });
          } else {
            // Handle unexpected data format
            throw new Error('Unexpected data format');
          }
        } catch (error) {
          setError(error.message);
        }
      };

      // Call the fetchData function
      fetchData();
    }
  }, [searchTerm]); // Only re-run the effect if searchTerm changes

  useEffect(() => {
    if (error) {
      setShowErrorClass(true); // Show error class when there's an error

      // Remove the error class after 4 seconds but keep the error message
      setTimeout(() => {
        setShowErrorClass(false);
      }, 3000);
    }
  }, [error]);

  // Determine the classnames dynamically
  const classNames = `error-message${showErrorClass ? " showError" : ""}`;

  return (
    <div className="app">
      <Header onThemeToggle={handleThemeToggle} theme={theme} />
      <div className='searchWrapper'>
        <Search onSearch={handleSearch} />
        {wordData ? (
          <WordDisplay wordData={wordData} />
        ) : (
          <p className="placeholder-text">Enter a word to get started</p>
        )}
      </div>
      <p className={classNames}>{error || ''}</p>
      {/* Rest of your app components */}
    </div>
  );
};

export default App; 
