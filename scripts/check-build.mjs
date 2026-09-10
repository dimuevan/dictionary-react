#!/usr/bin/env node
/**
 * Checks that `build/` is the thing we mean to upload.
 *
 * The app is served from a subdirectory, and every asset path is baked into the
 * HTML at build time. Getting that wrong produces a page that loads, renders
 * nothing, and reports no error — it happened twice while this was being
 * written, both times found by hand. This finds it in a second.
 *
 * It also checks that the service worker is caching the directory the build
 * actually emits: it spent its whole life caching Create React App's /static/,
 * which Vite has never written.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const base = process.env.VITE_BASE || '/challenges/react/dictionearch/';

/**
 * What the reader is asked to download. Today it is 187 KB of JavaScript and
 * 19 KB of stylesheet, which is fine; the point of a budget is that nobody
 * would otherwise notice the day it becomes 400. Raising a number here should
 * be a decision someone makes on purpose.
 */
const BUDGET = { '.js': 250 * 1024, '.css': 40 * 1024 };
const asKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const problems = [];
const sizes = [];
const note = (message) => problems.push(message);

if (!existsSync(BUILD)) {
  console.error(`No ${BUILD}/ directory. Run "npm run build" first.`);
  process.exit(1);
}

const html = readFileSync(join(BUILD, 'index.html'), 'utf8');

// Every path the browser is told to fetch, and where it would look for it.
const referenced = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(([, value]) => value);
const absolute = referenced.filter((value) => value.startsWith('/'));

if (absolute.length === 0) {
  note('index.html references no build assets at all — did the build run?');
}

// A relative path works at .../dictionearch/ and breaks at .../dictionearch —
// the same family of failure as the wrong base, and just as quiet.
referenced
  .filter((value) => !/^([a-z]+:|\/\/|\/|#|data:)/.test(value))
  .forEach((value) => note(`"${value}" is a relative path; it breaks without a trailing slash`));

absolute.forEach((path) => {
  if (!path.startsWith(base)) {
    note(`"${path}" does not start with the deploy base "${base}"`);
    return;
  }

  const onDisk = join(BUILD, path.slice(base.length));
  if (!existsSync(onDisk)) note(`"${path}" is referenced but ${onDisk} does not exist`);
});

['service-worker.js', 'manifest.json', 'favicon.ico', 'social-card.png'].forEach((file) => {
  if (!existsSync(join(BUILD, file))) note(`${file} is missing from ${BUILD}/`);
});

// The preview image is named by absolute URL, so nothing else would notice it
// going missing until someone pasted a link and got a blank card. Tags are
// written across several lines here, so collapse the whitespace before looking.
const flat = html.replace(/\s+/g, ' ');
const socialCard = (flat.match(/property="og:image" content="([^"]+)"/) || [])[1];

// The font used to come from Google Fonts through an @import, which is the
// slowest possible way to load one and a third-party request besides.
if (flat.includes('fonts.googleapis.com') || flat.includes('fonts.gstatic.com')) {
  note('index.html still reaches out to Google Fonts');
}

['lora-latin.woff2', 'lora-latin-italic.woff2'].forEach((font) => {
  if (!existsSync(join(BUILD, 'fonts', font))) note(`fonts/${font} is missing from ${BUILD}/`);
});

if (!socialCard) note('index.html declares no og:image');
else if (!/^https?:\/\//.test(socialCard)) {
  note(`og:image "${socialCard}" is relative; link previews need an absolute URL`);
}

// Which directory the hashed bundles actually landed in, per the HTML. Only
// the script and the stylesheet say: the fonts live in a directory of their own.
const assetDir = absolute
  .filter((path) => path.startsWith(base) && /\.(js|css)$/.test(path))
  .map((path) => path.slice(base.length).split('/')[0])
  .find((segment) => segment && !segment.includes('.'));

if (!assetDir) {
  note('index.html points at no asset directory under the deploy base');
} else {
  // Comments in the worker mention every directory this has ever cached, so
  // read the code and not the prose.
  const worker = readFileSync(join(BUILD, 'service-worker.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  if (!worker.includes(`/${assetDir}/`)) {
    note(
      `the service worker caches no path containing "/${assetDir}/", which is where ` +
        'this build put its assets — it would cache nothing'
    );
  }

  const assets = existsSync(join(BUILD, assetDir)) ? readdirSync(join(BUILD, assetDir)) : [];
  if (!assets.some((file) => file.endsWith('.js'))) note('no JavaScript bundle was emitted');
  if (!assets.some((file) => file.endsWith('.css'))) note('no stylesheet was emitted');

  Object.keys(BUDGET).forEach((extension) => {
    const total = assets
      .filter((file) => file.endsWith(extension))
      .reduce((sum, file) => sum + statSync(join(BUILD, assetDir, file)).size, 0);

    sizes.push({ extension, total, budget: BUDGET[extension] });
    if (total > BUDGET[extension]) {
      note(
        `${extension} assets are ${asKb(total)}, over the ${asKb(BUDGET[extension])} budget — ` +
          'either trim it or raise the budget in scripts/check-build.mjs on purpose'
      );
    }
  });
}

if (problems.length) {
  console.error(`This build is not ready for ${base}\n`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log(`build/ looks right for ${base}`);
console.log(`  ${absolute.length} asset references, all under the deploy base`);
console.log(`  hashed assets in ${assetDir}/, which the service worker caches`);
sizes.forEach(({ extension, total, budget }) => {
  console.log(
    `  ${extension} ${asKb(total)} of ${asKb(budget)} (${Math.round((total / budget) * 100)}%)`
  );
});
