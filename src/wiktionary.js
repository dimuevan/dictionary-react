const WIKTIONARY_URL = 'https://en.wiktionary.org/api/rest_v1/page/definition';

/**
 * Wiktionary returns definitions as HTML fragments (they contain links to other
 * entries). Parsing rather than regex-stripping keeps entities like &amp; and
 * &mdash; readable; DOMParser does not execute scripts, and React escapes the
 * result on render anyway.
 */
const toText = (html) => {
  if (typeof html !== 'string' || !html) return '';

  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
  } catch (error) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
};

const firstExample = (definition) => {
  if (Array.isArray(definition.examples) && definition.examples.length) {
    return toText(definition.examples[0]);
  }
  if (Array.isArray(definition.parsedExamples) && definition.parsedExamples.length) {
    return toText(definition.parsedExamples[0].example);
  }
  return '';
};

/**
 * Reshapes a Wiktionary payload into the same structure the primary API returns,
 * so WordDisplay never learns where an entry came from. Returns null when there
 * is nothing usable — a half-empty entry is worse than admitting the failure.
 *
 * Wiktionary carries no pronunciation audio at this endpoint, so `phonetics`
 * is deliberately empty and the play button simply does not render.
 */
export const normalizeWiktionary = (payload, term) => {
  const englishGroups = payload && Array.isArray(payload.en) ? payload.en : [];

  const meanings = englishGroups
    .map((group) => ({
      partOfSpeech: String(group.partOfSpeech || '').toLowerCase(),
      definitions: (group.definitions || [])
        .map((definition) => ({
          definition: toText(definition.definition),
          example: firstExample(definition),
        }))
        .filter((definition) => definition.definition),
      synonyms: [],
      antonyms: [],
    }))
    .filter((meaning) => meaning.partOfSpeech && meaning.definitions.length);

  if (!meanings.length) return null;

  return {
    data: [{ word: term, phonetics: [], meanings }],
    sourceUrls: [`https://en.wiktionary.org/wiki/${encodeURIComponent(term)}`],
  };
};

/**
 * The second source. dictionaryapi.dev is a volunteer project that reads
 * Wiktionary; this asks Wiktionary directly, on Wikimedia's own infrastructure.
 * No API key, and the endpoint sends permissive CORS headers.
 */
export const fetchWiktionary = async (term, signal) => {
  const response = await fetch(`${WIKTIONARY_URL}/${encodeURIComponent(term)}`, { signal });

  if (!response.ok) return null;

  const payload = await response.json();
  return normalizeWiktionary(payload, term);
};
