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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const base = process.env.VITE_BASE || '/challenges/react/dictionearch/';

const problems = [];
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

absolute.forEach((path) => {
  if (!path.startsWith(base)) {
    note(`"${path}" does not start with the deploy base "${base}"`);
    return;
  }

  const onDisk = join(BUILD, path.slice(base.length));
  if (!existsSync(onDisk)) note(`"${path}" is referenced but ${onDisk} does not exist`);
});

['service-worker.js', 'manifest.json', 'favicon.ico'].forEach((file) => {
  if (!existsSync(join(BUILD, file))) note(`${file} is missing from ${BUILD}/`);
});

// Which directory the hashed assets actually landed in, per the HTML.
const assetDir = absolute
  .filter((path) => path.startsWith(base))
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
}

if (problems.length) {
  console.error(`This build would not work at ${base}\n`);
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log(`build/ looks right for ${base}`);
console.log(`  ${absolute.length} asset references, all under the deploy base`);
console.log(`  hashed assets in ${assetDir}/, which the service worker caches`);
