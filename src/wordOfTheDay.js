/**
 * A small curated list, chosen deterministically by date: everyone opening the
 * app on the same day sees the same word, with no network call and no server.
 */
const WORDS = [
  'serendipity', 'petrichor', 'ephemeral', 'luminous', 'quixotic', 'saudade',
  'halcyon', 'ineffable', 'susurrus', 'limerence', 'apricity', 'eloquence',
  'vellichor', 'nadir', 'zenith', 'aplomb', 'candour', 'defenestration',
  'ebullient', 'fastidious', 'gossamer', 'hiraeth', 'incandescent', 'juxtapose',
  'kismet', 'labyrinth', 'mellifluous', 'nebulous', 'obfuscate', 'panacea',
  'quagmire', 'resplendent', 'sonder', 'talisman', 'ubiquitous', 'verdant',
  'wanderlust', 'xenial', 'yonder', 'zephyr', 'alacrity', 'brevity',
  'cacophony', 'diaphanous', 'effervescent', 'furtive', 'garrulous', 'harbinger',
  'idyllic', 'jubilant', 'kaleidoscope', 'lassitude', 'meridian', 'nocturne',
  'opulent', 'pellucid', 'quiescent', 'reverie', 'solitude', 'tempest',
];

const MS_PER_DAY = 86400000;

export const wordOfTheDay = (now = new Date()) => {
  const day = Math.floor(now.getTime() / MS_PER_DAY);
  return WORDS[((day % WORDS.length) + WORDS.length) % WORDS.length];
};

export default wordOfTheDay;
