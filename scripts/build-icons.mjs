// Renders public/icons/*.png from an SVG using the Playwright Chromium install.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

// full = edge-to-edge background (maskable / Apple, which round the corners themselves)
const svg = (full, scale = 0.86) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><clipPath id="card"><rect x="126" y="92" width="300" height="300" rx="44"/></clipPath></defs>
  <rect width="512" height="512" rx="${full ? 0 : 112}" fill="#0f1115"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="96" y="120" width="300" height="300" rx="44" fill="#2a2f3a" transform="rotate(-8 246 270)"/>
    <rect x="126" y="92" width="300" height="300" rx="44" fill="#e8344e"/>
    <g fill="#ffffff" opacity="0.16" clip-path="url(#card)">
      <rect x="126" y="92" width="60" height="60"/><rect x="246" y="92" width="60" height="60"/><rect x="366" y="92" width="60" height="60"/>
      <rect x="186" y="152" width="60" height="60"/><rect x="306" y="152" width="60" height="60"/>
    </g>
    <text x="276" y="330" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="210" fill="#ffffff">č</text>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/favicon.svg', svg(false).trim());
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const [name, size, full, scale] of [
  ['icon-192.png', 192, false, 0.86],
  ['icon-512.png', 512, false, 0.86],
  ['icon-maskable-512.png', 512, true, 0.7],
  ['apple-touch-icon.png', 180, true, 0.9],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg(full, scale)}`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: !full });
}
await browser.close();
console.log('icons written to public/icons');
