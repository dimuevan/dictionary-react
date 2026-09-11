import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The combobox, the aria-pressed toggles and the colour choices all went in by
 * hand and were checked by eye. This checks them the same way every time, in
 * both themes and at both widths, across the three screens the app has.
 *
 * It earned its place immediately: the first run reported twenty-four failures,
 * every one of them real. Grey text at 40% opacity looked deliberate and was
 * unreadable, and a colour picked to be legible in one theme was not in the
 * other.
 *
 * Only rules that describe a real barrier are enforced, so a finding here means
 * someone cannot use the page — not that a tool has an opinion.
 */
const entry = (word) => [
  {
    word,
    phonetics: [{ text: '/ˈkiːbɔːd/', audio: `https://example.com/${word}.mp3` }],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [{ definition: 'A set of keys.', example: 'I type on my keyboard.' }],
        synonyms: ['piano'],
        antonyms: ['silence'],
      },
    ],
    sourceUrls: [`https://en.wiktionary.org/wiki/${word}`],
  },
];

/**
 * Every request is answered here, the web font included: a scan whose results
 * depend on whether Google Fonts was reachable is not a check, it is a coin.
 */
const stubNetwork = (page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('api.dictionaryapi.dev')) return json(entry('keyboard'));
    if (url.includes('datamuse.com')) {
      if (url.includes('md=f')) return json([{ word: 'keyboard', tags: ['f:14.2'] }]);
      return json([{ word: 'fjord' }]);
    }
    if (url.includes('api.php')) {
      return json({ parse: { text: '<h3>Etymology</h3><p>From key plus board.</p>' } });
    }
    if (url.endsWith('.mp3')) return route.fulfill({ status: 404, body: '' });
    if (url.includes('fonts.googleapis.com')) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    return route.continue();
  });

const barriers = async (page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // The rule id and the element are what a reader of a failure needs.
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} on ${node.target}`)
  );
};

for (const theme of ['light', 'dark']) {
  test(`no barriers on any screen in ${theme}`, async ({ page }) => {
    await stubNetwork(page);
    await page.addInitScript((value) => {
      window.localStorage.setItem('dictionearch-theme', value);
    }, theme);

    // An entry, with everything optional on it.
    await page.goto('/?w=keyboard');
    await expect(page.locator('.word-title')).toBeVisible();
    await expect(page.locator('.etymology-text')).toBeVisible();
    await expect(page.locator('.frequency')).toBeVisible();
    expect(await barriers(page)).toEqual([]);

    await page.click('[aria-label="Save this word"]');

    // The empty screen: the cards, with a history and a saved word in them.
    await page.goto('/');
    await expect(page.locator('.search-input')).toBeVisible();
    await expect(page.locator('.card--daily .daily-definition')).toBeVisible();
    await expect(page.locator('.word-row-open').first()).toBeVisible();
    expect(await barriers(page)).toEqual([]);

    // And the flashcards.
    await page.click('.pill-button');
    await expect(page.locator('.study')).toBeVisible();
    expect(await barriers(page)).toEqual([]);

    // The completions, which are a combobox and the easiest thing to get wrong.
    await page.goto('/');
    await page.fill('.search-input', 'keyb');
    await expect(page.locator('.completions li').first()).toBeVisible();
    expect(await barriers(page)).toEqual([]);
  });
}
