/**
 * The primary API serves these under /entries/<code>/, and each has its own
 * Wiktionary at <code>.wiktionary.org — so a language costs no new infrastructure.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
];

export const DEFAULT_LANGUAGE = 'en';

export const isSupportedLanguage = (code) =>
  LANGUAGES.some((language) => language.code === code);

export const normalizeLanguage = (code) =>
  isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;

export const labelFor = (code) => {
  const found = LANGUAGES.find((language) => language.code === code);
  return found ? found.label : code;
};
