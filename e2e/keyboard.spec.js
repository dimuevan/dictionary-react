import { expect, test } from '@playwright/test';

/**
 * The half of accessibility no scanner does. axe can tell you a control has a
 * name and enough contrast; it cannot tell you the order the Tab key visits
 * things, whether you can see where you are, or whether you can get out again.
 *
 * These press only Tab, and check exactly those three.
 */
const entry = (word) => [
  {
    word,
    phonetics: [
      { text: '/ˈkiːbɔːd/', audio: `https://example.com/${word}-uk.mp3` },
      { text: '/ˈkiːbɔɹd/', audio: `https://example.com/${word}-us.mp3` },
    ],
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [{ definition: 'A set of keys.', example: 'I type on my keyboard.' }],
        synonyms: ['piano'],
        antonyms: [],
      },
    ],
    sourceUrls: [`https://en.wiktionary.org/wiki/${word}`],
  },
];

const stubNetwork = (page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('api.dictionaryapi.dev')) return json(entry('keyboard'));
    if (url.includes('datamuse.com')) {
      return url.includes('*') ? json([{ word: 'keyboardist' }, { word: 'keyboarding' }]) : json([]);
    }
    if (url.includes('api.php')) return json({});
    if (url.endsWith('.mp3')) return route.fulfill({ status: 404, body: '' });
    if (url.includes('fonts.googleapis.com')) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    }
    return route.continue();
  });

/** What has focus, named the way someone describing the page would name it. */
const focused = (page) =>
  page.evaluate(() => {
    const node = document.activeElement;
    if (!node || node === document.body) return 'nothing';

    const label =
      node.getAttribute('aria-label') ||
      node.getAttribute('placeholder') ||
      (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);

    return `${node.tagName.toLowerCase()}: ${label || '(unnamed)'}`;
  });

test('Tab walks the entry in the order it is read', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/?w=keyboard');
  await expect(page.locator('.word-title')).toBeVisible();

  const order = [];
  for (let step = 0; step < 18; step += 1) {
    await page.keyboard.press('Tab');
    order.push(await focused(page));
  }

  // Down the page, not around it: chrome first, then the entry, then its links.
  /*
   * The search box is focused on load, so Tab starts from the control after it
   * and walks down the page: the entry's own controls, then its links, then out
   * of the page entirely, then back in at the top. Nothing jumps.
   */
  expect(order).toEqual([
    'button: Search',
    'button: UK',
    'button: US',
    'button: Save this word',
    'button: Copy link to this word',
    'button: Download this word as an image',
    'button: Play pronunciation',
    'button: ☆Study this sense',
    'button: piano',
    'a: https://en.wiktionary.org/wi',
    'nothing',
    'a: DictionearchD',
    'select: EnglishEspañolFrançaisDeutsc',
    'select: SerifSans SerifMono',
    'input: Toggle dark mode',
    'input: Search for a word',
    'button: Search',
    'button: UK',
  ]);
});

test('every stop on the way says where it is', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/?w=keyboard');
  await expect(page.locator('.word-title')).toBeVisible();

  const invisible = [];
  for (let step = 0; step < 16; step += 1) {
    await page.keyboard.press('Tab');

    const seen = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node || node === document.body) return null;

      // The ring may be drawn around the control or around the thing it sits
      // in — the search bar rings the whole bar, not the bare input — so walk
      // up a little before deciding nothing is showing.
      const marked = (element) => {
        const style = getComputedStyle(element);
        return (
          (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== 'none' ||
          style.textDecorationLine.includes('underline')
        );
      };

      let element = node;
      for (let up = 0; up < 3 && element; up += 1) {
        if (marked(element)) return null;
        element = element.parentElement;
      }

      return `${node.tagName.toLowerCase()}.${node.className || '(no class)'}`;
    });

    if (seen) invisible.push(seen);
  }

  // A focus you cannot see is the same as no focus at all.
  expect(invisible).toEqual([]);
});

test('the search box lets go of the Tab key', async ({ page }) => {
  await stubNetwork(page);
  await page.goto('/');

  await page.fill('.search-input', 'keyb');
  await expect(page.locator('.completions li').first()).toBeVisible();

  // An open listbox is the classic place to get stuck.
  await page.keyboard.press('Tab');
  expect(await focused(page)).not.toBe('input: Search a word, e.g. keyboard');
  await page.keyboard.press('Tab');
  expect(await focused(page)).not.toBe('nothing');
});
