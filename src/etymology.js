const TIMEOUT_MS = 5000;
const MAX_LENGTH = 600;

/**
 * Where a word came from is often the most interesting part of an entry, and
 * Wiktionary has it — but not on the definition endpoint. This asks the
 * MediaWiki parse API for the rendered page and reads the Etymology section
 * out of it.
 *
 * Page structure is Wiktionary's, not ours, so every step is written to give up
 * quietly: a missing or unrecognised section returns null and nothing renders.
 */
const findEtymologyText = (html) => {
  let document;
  try {
    document = new DOMParser().parseFromString(html, 'text/html');
  } catch (error) {
    return null;
  }

  // A flat scan in document order works whether the page wraps sections in
  // <section> elements or leaves headings as plain siblings.
  const nodes = [...document.querySelectorAll('h2, h3, h4, h5, p')];
  const isHeading = (node) => /^H[2-5]$/.test(node.tagName);

  const start = nodes.findIndex(
    (node) => isHeading(node) && /^etymolog/i.test((node.textContent || '').trim())
  );
  if (start === -1) return null;

  for (let index = start + 1; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (isHeading(node)) return null; // the section held no prose

    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) {
      return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH).trimEnd()}…` : text;
    }
  }

  return null;
};

export const fetchEtymology = async (term, lang, signal) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const relay = () => controller.abort();
  if (signal) signal.addEventListener('abort', relay, { once: true });

  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: term,
      prop: 'text',
      format: 'json',
      formatversion: '2',
      origin: '*', // anonymous CORS, as the MediaWiki API requires
      redirects: '1',
    });

    const response = await fetch(
      `https://${lang}.wiktionary.org/w/api.php?${params}`,
      { signal: controller.signal }
    );
    if (!response.ok) return null;

    const payload = await response.json();
    const html = payload && payload.parse && payload.parse.text;
    return typeof html === 'string' ? findEtymologyText(html) : null;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', relay);
  }
};

export { findEtymologyText };
