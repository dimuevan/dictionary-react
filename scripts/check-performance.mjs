#!/usr/bin/env node
/**
 * Measures the page the way a browser experiences it, and fails when it gets
 * slower or less usable. The size budget in check-build.mjs counts bytes; this counts the
 * thing bytes are a proxy for — how long until the page is there.
 *
 *   npm run check:perf
 *
 * It builds, serves that build, and runs Lighthouse against it in the same
 * Chromium the browser tests use. Scores move a little run to run, so the
 * thresholds are set where only a real regression trips them, and every number
 * is printed whether it passes or not.
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';

const PORT = 4188;
const URL = `http://127.0.0.1:${PORT}/`;

// Where the numbers are today, with room for the noise of a shared CI machine.
const FLOOR = { performance: 0.9, accessibility: 1, 'best-practices': 0.9, seo: 0.9 };
const CEILING = { 'largest-contentful-paint': 2500, 'total-blocking-time': 300 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const serve = async () => {
  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { env: { ...process.env, VITE_BASE: '/' }, stdio: 'ignore' }
  );

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(250);
    try {
      const response = await fetch(URL);
      if (response.ok) return server;
    } catch (error) {
      // not up yet
    }
  }

  server.kill();
  throw new Error(`the preview server never answered on ${URL}`);
};

const build = () =>
  new Promise((resolve, reject) => {
    const child = spawn('npx', ['vite', 'build'], {
      env: { ...process.env, VITE_BASE: '/' },
      stdio: 'ignore',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('the build failed'))));
  });

console.log('Building…');
await build();

const server = await serve();
const browser = await chromium.launch({ args: ['--remote-debugging-port=9333'] });

let report;
try {
  report = await lighthouse(URL, {
    port: 9333,
    output: 'json',
    logLevel: 'error',
    screenEmulation: { mobile: false, width: 1280, height: 800, deviceScaleFactor: 1 },
    formFactor: 'desktop',
    throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
  });
} finally {
  await browser.close();
  server.kill();
}

const { categories, audits } = report.lhr;
const problems = [];

console.log('');
Object.keys(categories).forEach((key) => {
  const score = categories[key].score;
  const floor = FLOOR[key];
  const verdict = floor === undefined ? '' : score >= floor ? '  ok' : `  under ${floor}`;
  console.log(`  ${categories[key].title.padEnd(16)} ${(score * 100).toFixed(0).padStart(3)}${verdict}`);

  if (floor !== undefined && score < floor) {
    problems.push(`${categories[key].title} scored ${(score * 100).toFixed(0)}, under ${floor * 100}`);
  }
});

console.log('');
['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift']
  .forEach((id) => {
    const audit = audits[id];
    if (!audit) return;

    console.log(`  ${audit.title.padEnd(28)} ${audit.displayValue || ''}`);
    const ceiling = CEILING[id];
    if (ceiling !== undefined && audit.numericValue > ceiling) {
      problems.push(`${audit.title} is ${Math.round(audit.numericValue)}ms, over ${ceiling}ms`);
    }
  });

if (problems.length) {
  console.error('\nThe page got slower:\n');
  problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

console.log('\nWithin budget.');
