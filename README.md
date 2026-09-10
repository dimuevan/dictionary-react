# Dictionearch

An English dictionary in the browser. Type a word, get its definitions, examples,
synonyms, pronunciation and origin — and keep the ones worth keeping.

Built by [Evan Dimu](https://iamevandimu.com) as a first React project, then taken
rather further than that.

**Live:** <http://dev.iamevandimu.com/challenges/react/dictionearch/>

---

## What it does

**Looks words up.** Definitions grouped by part of speech, examples, synonyms and
antonyms — each one clickable, so an entry is a place to wander rather than a dead
end. Long entries fold to three senses with the rest a click away.

**Speaks them.** Where the dictionary carries more than one recording, a chip per
accent (US, UK, AU) selects and plays it, and the phonetic spelling follows.

**Keeps working when the dictionary does not.** Three layers, in order:

1. `api.dictionaryapi.dev`, with a 3.5s deadline
2. Wiktionary's own REST API, if the first cannot be reached
3. a saved copy from `localStorage`, if neither answers

A source that fails is set aside for a minute, so the next search does not pay its
timeout again. A word already seen opens from storage immediately and refreshes
behind the scenes.

**Remembers.** Every lookup is saved; the empty screen offers the recent ones.
Star the ones you mean to keep, study them as flashcards on a Leitner schedule,
and export to CSV, to Anki, or as a JSON backup you can restore on another machine.

**Reads six languages.** English, Spanish, French, German, Italian and Portuguese,
each from its own dictionary and its own Wiktionary.

**Behaves like a tool.** The word lives in the address bar, so definitions are
shareable and the back button works. `/` jumps to the search box, `Escape` clears
it, arrow keys walk the suggestions. Light and dark, three typefaces, and a
service worker so it opens offline.

---

## Running it

```bash
npm install
npm start          # http://localhost:3000
```

Full instructions, including the production build and its one trap, are in
[RUN.md](RUN.md).

```bash
npm test           # 57 unit tests
npm run e2e        # 14 browser checks, desktop and phone
npm run build      # production build for the hosting subdirectory
npm run check:apis # the shapes the three services are expected to return
```

Both suites run on every push — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
A third workflow checks the real services against the shapes this app expects,
once a day, because every test here mocks the network.

---

## How it is put together

No router, no state library, no UI framework: React, Vite and the platform.

```
src/
├── App.jsx             # layout and what the screen shows
├── useDictionary.js    # the lookup: sources, deadlines, cache, failure kinds
├── wiktionary.js       # second source, reshaped to match the first
├── datamuse.js         # spelling suggestions, completions, frequency, rhymes
├── etymology.js        # the Origin section, read out of a Wiktionary page
├── wordCache.js        # saved entries, which double as the history
├── favourites.js       # starred words, CSV and Anki export
├── studySchedule.js    # Leitner boxes
├── backup.js           # JSON export and merge-on-restore
├── urlTerm.js          # the word and language in the address bar
├── usePreferences.js   # theme and typeface
├── useWordRequest.js   # the word on screen, and the browser history
└── …                   # components and their stylesheets
```

Two decisions worth knowing:

**Failures carry a kind.** A word that does not exist, a service that will not
answer, and a payload that cannot be read are three different problems, and the
screen says which. A browser reports all of them as `Failed to fetch`; the reader
never sees that string.

**Nothing optional may break the essential.** Frequency, rhymes, etymology and
suggestions each fail to nothing. If Datamuse is down you get a definition with
fewer extras, not an error.

---

## Credits

Definitions from [Free Dictionary API](https://dictionaryapi.dev) and
[Wiktionary](https://en.wiktionary.org). Related words and frequency from
[Datamuse](https://www.datamuse.com/api/). Design based on the
[Frontend Mentor dictionary web app challenge](https://www.frontendmentor.io/challenges/dictionary-web-app-h5wwnH6IV).
