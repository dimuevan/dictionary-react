import './Header.css'; // Assuming you have a CSS file for styling

import { ReactComponent as MoonIcon } from './images/icons/moon.svg';
import React from 'react';
import { ReactComponent as SunIcon } from './images/icons/sun.svg';

const Header = ({ onThemeToggle, theme }) => {
  return (
    <header className="header">
      <a href={`${process.env.PUBLIC_URL}/`} className="logo--link">
        <div className="logo--text" title="Dictionearch">
          <span className='fulllogo'>Dictionearch</span>
          <span className='monogram'>D</span>
        </div>
      </a>


      <div className="theme-toggle-wrapper">
        <div className="theme-toggle">
            {/* Theme toggle switch */}
            <label className="switch">
            <input
                type="checkbox"
                checked={theme === 'dark'}
                onChange={onThemeToggle}
                aria-label="Toggle dark mode"
            />
            <span className="slider round"></span>
            </label>
        </div>
        
        {/* Moon icon for dark mode - can change depending on the theme */}
        <div className="moon-icon">
        {theme === 'dark' ? <SunIcon width="30" height="30" /> : <MoonIcon width="24" height="24" />}
        </div>
      </div>
    </header>
  );
};

export default Header;
