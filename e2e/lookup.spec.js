const { expect, test } = require('@playwright/test');

const entry = (word, overrides = {}) => [
  {
    word,
    phonetics: [
      { text: '/ˈkiːbɔːd/', audio: `https://example.com/${word}-uk.mp3` },
      { text: '/ˈkiːbɔɹd/', audio: `https://example.com/${word}-us.mp3` },
    ],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [{ definition: `A set of keys, as in ${word}.`, example: `I use a ${word}.` }],
        synonyms: ['piano'],
        antonyms: [],
      },
    ],
    sourceUrls: [`https://en.wiktionary.org/wiki/${word}`],
    ...overrides,
  },
];

/** Every outbound call is answered here, so the suite never depends on a service. */
const stubNetwork = async (page, { dictionary = 200 } = {}) => {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('api.dictionaryapi.dev')) {
      if (dictionary !== 200) return json({}, dictionary);
      const word = decodeURIComponent(url.split('/').pop());
      return json(entry(word));
    }
    if (url.includes('wiktionary.org/api/rest_v1')) return json({ en: [] });
    if (url.includes('api.php')) return json({ parse: { text: '<h3>Etymology</h3><p>From key + board.</p>' } });
    if (url.includes('datamuse.com')) {
      if (url.includes('md=f')) return json([{ word: 'keyboard', tags: ['f:14.2'] }]);
      if (url.includes('rel_rhy') || url.includes('ml=')) return json([{ word: 'fjord' }]);
      if (url.includes('*')) return json([{ word: 'keyboard' }, { word: 'keyboardist' }]);
      return json([{ word: 'keyboard' }]);
    }
    return route.continue();
  });
};

test('looks a word up and shows the entry', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/');

  await page.fill('.search-input', 'keyboard');
  await page.press('.search-input', 'Enter');

  await expect(page.locator('.word-title')).toHaveText('keyboard');
  await expect(page.getByText('A set of keys, as in keyboard.')).toBeVisible();
  await expect(page).toHaveURL(/\?w=keyboard/);
});

test('the search bar stays on one line when suggestions open', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/');

  const closed = await page.locator('.search-bar').boundingBox();
  await page.fill('.search-input', 'keyb');
  await page.waitForSelector('.completion');
  const open = await page.locator('.search-bar').boundingBox();

  // This is the regression that a unit test cannot see.
  expect(Math.round(open.height)).toBe(Math.round(closed.height));
});

test('arrow keys and Enter pick a suggestion', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/');

  await page.fill('.search-input', 'keyb');
  await page.waitForSelector('.completion');
  await page.press('.search-input', 'ArrowDown');
  await page.press('.search-input', 'ArrowDown');
  await page.press('.search-input', 'Enter');

  await expect(page.locator('.word-title')).toHaveText('keyboardist');
});

test('the back button moves between words', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/');

  await page.fill('.search-input', 'keyboard');
  await page.press('.search-input', 'Enter');
  await expect(page.locator('.word-title')).toHaveText('keyboard');

  await page.click('.keyword-button:has-text("piano")');
  await expect(page.locator('.word-title')).toHaveText('piano');

  await page.goBack();
  await expect(page.locator('.word-title')).toHaveText('keyboard');
  await expect(page.locator('.search-input')).toHaveValue('keyboard');
});

test('saving a word puts it under Saved, ready to study', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/?w=keyboard');

  await page.click('[aria-label="Save this word"]');
  await page.goto('/');
  await page.click('[role="tab"]:has-text("Saved")');

  await expect(page.locator('.recent-list .chip')).toHaveText(['keyboard']);
  await page.click('.recent-clear:has-text("Study")');
  await expect(page.locator('.study-definition')).toBeVisible();
});

test('a word that does not exist offers spellings instead of a dead end', async ({ page }) => {
  await stubNetwork(page, { dictionary: 404 });
  await page.goto('/');

  await page.fill('.search-input', 'zzzzqqq');
  await page.press('.search-input', 'Enter');

  await expect(page.getByText(/No results for/)).toBeVisible();
  await expect(page.locator('.suggestions .chip').first()).toBeVisible();
});

test('the page holds together at phone width', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/?w=keyboard');
  await page.waitForSelector('.word-title');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
