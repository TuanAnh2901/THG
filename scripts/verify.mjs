// THG verify — dev only. Self-starts a static server, drives the page in the
// locally installed Edge (no browser download) and checks the things that broke
// during the rebuild.
//   node scripts/verify.mjs            # all checks + screenshots in .tmp/shots/
//   node scripts/verify.mjs --only=glass
import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = '.tmp/shots';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

async function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      const file = join(ROOT, rel === '' ? 'index.html' : rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/index.html` };
}

const started = process.env.THG_URL ? null : await startServer();
const BASE = process.env.THG_URL ?? started.url;
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;

const results = [];
const consoleErrors = [];
const CHECKS = {};
const check = (name, fn) => { CHECKS[name] = fn; };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ channel: 'msedge' });
const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const desktop = await desktopCtx.newPage();
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const mobile = await mobileCtx.newPage();
const reducedCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const reduced = await reducedCtx.newPage();

for (const p of [desktop, mobile, reduced]) {
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${m.location().url ?? ''}`); });
  p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e)));
}
await desktop.goto(BASE, { waitUntil: 'domcontentloaded' });
await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
await reduced.goto(BASE, { waitUntil: 'domcontentloaded' });
await desktop.waitForTimeout(4000);

check('structure', async ({ page }) => {
  const r = await page.evaluate(() => ({
    html: document.querySelectorAll('html').length,
    nested: document.querySelectorAll('body > html, body > head, body > body').length,
    viewport: document.querySelector('meta[name="viewport"]')?.content ?? '',
    title: document.title,
    panel: !!document.querySelector('.glass'),
    button: !!document.querySelector('#musicToggle'),
    audio: !!document.querySelector('#bgMusic'),
    text: document.querySelector('#text1')?.textContent ?? '',
  }));
  assert(r.html === 1, `expected 1 <html>, got ${r.html}`);
  assert(r.nested === 0, 'nested html/head/body inside body');
  assert(/width\s*=\s*device-width/.test(r.viewport), `viewport meta missing (${r.viewport})`);
  assert(r.title.length > 0, 'title missing');
  assert(r.panel, '.glass panel missing');
  assert(r.button, '#musicToggle missing');
  assert(r.audio, '#bgMusic missing');
  assert(r.text.includes('20/10'), `message does not mention 20/10 (${r.text.slice(0, 40)})`);
});

check('glass', async ({ page }) => {
  const r = await page.evaluate(() => {
    const panel = document.querySelector('.glass');
    const btn = document.querySelector('#musicToggle');
    const filters = [...document.querySelectorAll('filter')];
    const disp = filters.find((f) => f.querySelector('feDisplacementMap'));
    return {
      panelFilter: getComputedStyle(panel).backdropFilter || getComputedStyle(panel).webkitBackdropFilter,
      btnFilter: getComputedStyle(btn).backdropFilter || getComputedStyle(btn).webkitBackdropFilter,
      filters: filters.length,
      chain: disp ? [...disp.children].map((c) => c.tagName) : [],
      srgb: disp?.getAttribute('color-interpolation-filters') ?? null,
      radius: parseFloat(getComputedStyle(panel).borderRadius),
    };
  });
  assert(r.panelFilter.includes('url('), `panel has no refraction filter (${r.panelFilter})`);
  assert(r.btnFilter.includes('url('), `music button has no refraction filter (${r.btnFilter})`);
  assert(r.filters >= 2, `expected 2 glass filters, got ${r.filters}`);
  assert(r.chain.includes('feDisplacementMap'), `filter chain misses feDisplacementMap (${r.chain.join(',')})`);
  assert(r.chain.includes('feGaussianBlur'), `filter chain misses the frost blur (${r.chain.join(',')})`);
  assert(r.chain.includes('feComposite'), `filter chain misses the specular composite (${r.chain.join(',')})`);
  assert(r.chain.includes('feComponentTransfer'), `filter chain misses the specular opacity (${r.chain.join(',')})`);
  assert(r.chain.filter((t) => t === 'feImage').length === 2, `expected a displacement map + a specular map, got ${r.chain.join(',')}`);
  assert(r.srgb === 'sRGB', `color-interpolation-filters=${r.srgb}, must be sRGB`);
  assert(r.radius > 0, 'panel has no border radius');
});

check('scene', async ({ page }) => {
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { w: c?.width ?? 0, h: c?.height ?? 0, aria: c?.getAttribute('aria-hidden') };
  });
  assert(r.w > 0 && r.h > 0, 'canvas has no size');
  assert(r.aria === 'true', 'canvas should be aria-hidden (decorative)');

  // the particle scene must actually paint something colourful
  const shot = await page.screenshot();
  const painted = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(Math.round(cv.width * 0.35), 0, Math.round(cv.width * 0.6), cv.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > 70) lit++;
    return +(100 * lit / (d.length / 4)).toFixed(1);
  }, shot.toString('base64'));
  assert(painted > 3, `particle scene looks empty (${painted}% lit pixels in the scene area)`);

  // frame rate: the glass filter re-samples the backdrop every frame.
  // The harness runs three pages at once, so the bar is lower than a solo tab.
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res((n / ((performance.now() - t0) / 1000)).toFixed(1)); };
    requestAnimationFrame(tick);
  }));
  assert(fps > 25, `frame rate too low: ${fps} fps`);
  return { litPct: painted, fps: +fps };
});

check('contrast', async ({ page }) => {
  const shot = await page.screenshot();
  const ratio = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const panel = document.querySelector('.glass').getBoundingClientRect();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const x = Math.round(panel.left), y = Math.round(panel.top);
    const w = Math.round(panel.width), h = Math.round(panel.height);
    const d = g.getImageData(x, y, w, h).data;
    const lum = (r, gg, b) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
    // text pixels = the brightest, background = everything below the median
    const lums = [];
    for (let i = 0; i < d.length; i += 4) lums.push({ l: lum(d[i], d[i + 1], d[i + 2]), r: d[i], g: d[i + 1], b: d[i + 2] });
    const sorted = [...lums].sort((a, b) => a.l - b.l);
    const median = sorted[Math.floor(sorted.length / 2)].l;
    const bright = lums.filter((p) => p.l > Math.max(median * 4, 0.2));
    if (!bright.length) return 0;
    const text = bright.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
    const n = bright.length;
    const fg = [text.r / n, text.g / n, text.b / n];
    const bg = sorted[Math.floor(sorted.length * 0.25)];
    const L1 = lum(fg[0], fg[1], fg[2]);
    const L2 = bg.l;
    return +(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2));
  }, shot.toString('base64'));
  assert(ratio >= 4.5, `text contrast on the panel is ${ratio}:1 (need 4.5:1)`);
  return { contrast: ratio };
});

check('a11y', async ({ page }) => {
  const r = await page.evaluate(() => {
    const btn = document.querySelector('#musicToggle');
    return {
      pressed: btn.getAttribute('aria-pressed'),
      label: btn.getAttribute('aria-label'),
      srOnly: !!document.querySelector('.sr-only'),
      canvasHidden: document.querySelector('canvas')?.getAttribute('aria-hidden') === 'true',
    };
  });
  assert(r.pressed !== null, 'music button has no aria-pressed');
  assert(r.label && r.label.length > 2, 'music button has no aria-label');
  assert(r.srOnly, 'screen-reader copy of the message missing');
  assert(r.canvasHidden, 'canvas is not aria-hidden');

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { id: el.id, outline: `${cs.outlineStyle} ${cs.outlineWidth}` };
  });
  assert(focused.id === 'musicToggle', `first tab stop is "${focused.id}", expected musicToggle`);
  assert(!/none/.test(focused.outline), `focused button has no visible outline (${focused.outline})`);
});

check('mobile', async () => {
  await mobile.waitForTimeout(1500);
  const r = await mobile.evaluate(() => {
    const card = document.querySelector('.glass').getBoundingClientRect();
    const btn = document.querySelector('#musicToggle').getBoundingClientRect();
    return {
      card: { l: card.left, r: card.right, t: card.top, b: card.bottom },
      btn: { l: btn.left, r: btn.right, t: btn.top, b: btn.bottom },
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      canvas: { w: document.querySelector('canvas').width, h: document.querySelector('canvas').height },
    };
  });
  assert(r.scrollW <= r.innerW, `horizontal overflow on mobile (${r.scrollW} > ${r.innerW})`);
  const overlap = r.card.l < r.btn.r && r.btn.l < r.card.r && r.card.t < r.btn.b && r.btn.t < r.card.b;
  assert(!overlap, `panel overlaps the music button on mobile: card=${JSON.stringify(r.card)} btn=${JSON.stringify(r.btn)}`);
  assert(r.canvas.h > 0, 'canvas has no height on mobile');
});

check('reduced-motion', async () => {
  await reduced.waitForTimeout(1500);
  const r = await reduced.evaluate(() => {
    const panel = document.querySelector('.glass');
    const cs = getComputedStyle(panel, '::after');
    return { shimmer: cs.animationName, reduce: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  assert(r.reduce, 'reduced-motion context did not report the preference');
  assert(r.shimmer === 'none', `shimmer still animates under reduced motion (${r.shimmer})`);
});

check('console', async () => {
  const real = consoleErrors.filter((t) => !/favicon\.ico/i.test(t));
  assert(real.length === 0, `console errors:\n  - ${real.slice(0, 5).join('\n  - ')}`);
});

for (const [name, fn] of Object.entries(CHECKS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  try {
    const detail = await fn({ page: desktop, mobile });
    const note = detail && typeof detail === 'object' ? JSON.stringify(detail) : '';
    results.push([name, 'PASS', note]);
  } catch (e) {
    results.push([name, 'FAIL', e.message]);
  }
}

await mkdir(SHOTS, { recursive: true });
await desktop.screenshot({ path: `${SHOTS}/desktop-1440x900.png` });
await mobile.screenshot({ path: `${SHOTS}/mobile-390x844.png` });
await browser.close();
if (started) started.server.close();

let failed = 0;
for (const [name, status, msg] of results) {
  console.log(`${status}  ${name}${msg ? '  -> ' + msg : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
