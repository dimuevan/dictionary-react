import './Header.css'; // Assuming you have a CSS file for styling


import { MoonIcon, SunIcon } from './icons';

import { LANGUAGES } from './languages';

const Header = ({ onThemeToggle, theme, font, onFontChange, lang, onLanguageChange }) => {
  return (
    <header className="header">
      <a href={import.meta.env.BASE_URL} className="logo--link">
        <div className="logo--text" title="Dictionearch">
          <span className='fulllogo'>Dictionearch</span>
          <span className='monogram'>D</span>
        </div>
      </a>


      <div className="header-controls">
        <label className="font-picker">
          <span className="visually-hidden">Language</span>
          <select
            className="font-select"
            value={lang}
            onChange={(event) => onLanguageChange(event.target.value)}
          >
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <label className="font-picker">
          <span className="visually-hidden">Typeface</span>
          <select
            className="font-select"
            value={font}
            onChange={(event) => onFontChange(event.target.value)}
          >
            <option value="serif">Serif</option>
            <option value="sans">Sans Serif</option>
            <option value="mono">Mono</option>
          </select>
        </label>

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
      </div>
    </header>
  );
};

export default Header;
