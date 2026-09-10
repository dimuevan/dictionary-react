/**
 * Hits the real services and checks the shape this app depends on.
 *
 * Every other test in this repository mocks the network — necessarily, since the
 * shapes are all we control. That leaves one blind spot: a provider changing its
 * response. This closes it, on a schedule rather than on every push, so a change
 * is found by a build rather than by a reader.
 *
 * Exits non-zero on a broken contract. A service being down is reported but does
 * not fail the run: an outage is not a contract change, and the app already
 * copes with one.
 */

const TIMEOUT_MS = 15000;

const results = [];

const record = (name, status, detail) => {
  results.push({ name, status, detail });
  const mark = status === 'ok' ? '✓' : status === 'down' ? '~' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
};

const getJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status, body: await response.json() };
  } finally {
    clearTimeout(timer);
  }
};

const check = async (name, url, assert) => {
  let payload;
  try {
    payload = await getJson(url);
  } catch (error) {
    record(name, 'down', `unreachable (${error.name})`);
    return;
  }

  if (!payload.ok) {
    record(name, 'down', `HTTP ${payload.status}`);
    return;
  }

  try {
    assert(payload.body);
    record(name, 'ok');
  } catch (error) {
    record(name, 'broken', error.message);
  }
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

await check(
  'dictionaryapi.dev — entry shape',
  'https://api.dictionaryapi.dev/api/v2/entries/en/keyboard',
  (body) => {
    expect(Array.isArray(body) && body.length > 0, 'expected a non-empty array');
    const [first] = body;
    expect(typeof first.word === 'string', 'entry.word must be a string');
    expect(Array.isArray(first.meanings), 'entry.meanings must be an array');
    expect(
      first.meanings.every((m) => typeof m.partOfSpeech === 'string' && Array.isArray(m.definitions)),
      'each meaning needs partOfSpeech and definitions'
    );
    expect(
      first.meanings[0].definitions.every((d) => typeof d.definition === 'string'),
      'each definition needs a definition string'
    );
    expect(Array.isArray(first.phonetics), 'entry.phonetics must be an array');
  }
);

// A miss must stay a 404: the app treats that status, and only that status, as
// "this word does not exist" rather than as an outage worth a second source.
try {
  const miss = await getJson('https://api.dictionaryapi.dev/api/v2/entries/en/zzzzqqqwwww');
  if (miss.status === 404) record('dictionaryapi.dev — a miss is still a 404', 'ok');
  else record('dictionaryapi.dev — a miss is still a 404', 'broken', `got HTTP ${miss.status}`);
} catch (error) {
  record('dictionaryapi.dev — a miss is still a 404', 'down', `unreachable (${error.name})`);
}

await check(
  'Wiktionary — definition endpoint',
  'https://en.wiktionary.org/api/rest_v1/page/definition/keyboard',
  (body) => {
    expect(Array.isArray(body.en), 'payload must be keyed by language with an "en" array');
    const [group] = body.en;
    expect(typeof group.partOfSpeech === 'string', 'group needs partOfSpeech');
    expect(Array.isArray(group.definitions), 'group needs definitions');
    expect(typeof group.definitions[0].definition === 'string', 'definition must be a string');
  }
);

await check(
  'Wiktionary — parse API, used for Origin',
  'https://en.wiktionary.org/w/api.php?action=parse&page=keyboard&prop=text&format=json&formatversion=2&origin=*',
  (body) => {
    expect(body.parse && typeof body.parse.text === 'string', 'parse.text must be an HTML string');
    expect(/etymolog/i.test(body.parse.text), 'the page should contain an Etymology section');
  }
);

await check(
  'Datamuse — spelling suggestions',
  'https://api.datamuse.com/words?sp=keybord&max=5',
  (body) => {
    expect(Array.isArray(body), 'expected an array');
    expect(body.length > 0 && typeof body[0].word === 'string', 'each result needs a word');
  }
);

await check(
  'Datamuse — frequency tag',
  'https://api.datamuse.com/words?sp=keyboard&md=f&max=1',
  (body) => {
    expect(Array.isArray(body) && body.length > 0, 'expected a result');
    expect(
      Array.isArray(body[0].tags) && body[0].tags.some((tag) => tag.startsWith('f:')),
      'expected an "f:" frequency tag'
    );
  }
);

const broken = results.filter((result) => result.status === 'broken');
const down = results.filter((result) => result.status === 'down');

console.log(
  `\n${results.length - broken.length - down.length} ok, ${down.length} unreachable, ${broken.length} broken`
);

if (broken.length) {
  console.log('\nA contract changed. The app expects these shapes:');
  broken.forEach((result) => console.log(`  ${result.name}: ${result.detail}`));
  process.exit(1);
}
