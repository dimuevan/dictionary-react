#!/usr/bin/env node
/**
 * Draws public/social-card.png, the image a link to Dictionearch shows when it
 * is pasted somewhere. Run it when the wording or the colours change:
 *
 *   npm run card
 *
 * It renders in the same browser the tests use rather than pulling in an image
 * library, and it deliberately uses no web font: a generator that needs Google
 * Fonts to be reachable produces a different picture depending on the network.
 * Georgia is what the app itself falls back to.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = 'public/social-card.png';

const card = `
<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    background: #fff;
    font-family: Georgia, "Times New Roman", serif;
    color: #111;
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 96px;
    position: relative;
  }
  .rule { position: absolute; inset: 0 0 auto 0; height: 14px; background: #a543e8; }
  .word { font-size: 132px; font-weight: 700; letter-spacing: -2px; }
  .phon {
    font-family: system-ui, sans-serif;
    font-size: 40px; color: #8b2fc9; margin-top: 12px; letter-spacing: 2px;
  }
  .sense { font-size: 40px; line-height: 1.4; margin-top: 40px; max-width: 900px; }
  .pos { font-style: italic; color: #6b6b6b; }
  .site {
    position: absolute; left: 96px; bottom: 64px;
    font-family: system-ui, sans-serif; font-size: 26px; color: #6b6b6b;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
</style>
<div class="rule"></div>
<div class="word">dictionearch</div>
<div class="phon">/ˈdɪkʃənɜːtʃ/</div>
<div class="sense">
  <span class="pos">noun.</span>
  A dictionary that keeps working when the dictionary does not.
</div>
<div class="site">iamevandimu.com</div>
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.setContent(card, { waitUntil: 'load' });
const png = await page.screenshot({ type: 'png' });
await browser.close();

writeFileSync(OUT, png);
console.log(`${OUT} — ${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(1)} KB`);
