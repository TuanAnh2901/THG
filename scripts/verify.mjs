// Verify harness for THG — dev-only. Uses the locally installed Edge (no browser download).
//   node scripts/verify.mjs                 -> run every check, write .tmp/shots/*.png
//   node scripts/verify.mjs --only=glass    -> run a subset
// Exit code = number of failed checks.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.THG_URL ?? 'http://127.0.0.1:8777/index.html';
const SHOTS = '.tmp/shots';
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;

const results = [];
const consoleErrors = [];

const CHECKS = {};
/** Register a check. `fn` receives { page, mobile } and throws on failure. */
const check = (name, fn) => { CHECKS[name] = fn; };

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ channel: 'msedge' });

const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const desktop = await desktopCtx.newPage();
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const mobile = await mobileCtx.newPage();

for (const p of [desktop, mobile]) {
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${m.text()} @ ${m.location().url ?? ''}`); });
  p.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e) + ' @ ' + (e.stack ?? '').split('\n')[0]));
}

await desktop.goto(BASE, { waitUntil: 'load' });
await mobile.goto(BASE, { waitUntil: 'load' });
await desktop.waitForTimeout(1500);

// ---------------------------------------------------------------- checks ----

check('structure', async ({ page }) => {
  const r = await page.evaluate(() => {
    const nested = document.querySelectorAll('body > html, body > head, body > body').length;
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
    return {
      htmlCount: document.querySelectorAll('html').length,
      nested,
      viewport,
      hasOldHero: !!document.querySelector('.bg_heart, .container'),
      card: !!document.querySelector('#glass-card'),
      dockButtons: document.querySelectorAll('#dock button').length,
      audio: !!document.querySelector('#bgMusic'),
      text: (document.querySelector('#text1')?.textContent ?? '').trim(),
      title: document.title,
    };
  });
  assert(r.htmlCount === 1, `expected 1 <html>, got ${r.htmlCount}`);
  assert(r.nested === 0, `found ${r.nested} nested html/head/body inside body`);
  assert(/width\s*=\s*device-width/.test(r.viewport), `missing viewport meta, got "${r.viewport}"`);
  assert(!r.hasOldHero, 'legacy .bg_heart / .container still present');
  assert(r.card, '#glass-card missing');
  assert(r.dockButtons === 2, `expected 2 dock buttons, got ${r.dockButtons}`);
  assert(r.audio, '#bgMusic missing');
  assert(r.text.length > 80, `#text1 too short (${r.text.length})`);
  assert(r.text.includes('20'), '#text1 does not mention 20');
  assert(r.title !== 'A mysterious gift for you', `stale title: ${r.title}`);
});

check('a11y', async ({ page }) => {
  const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#dock button')];
    return {
      btns: btns.map((b) => ({
        id: b.id,
        pressed: b.getAttribute('aria-pressed'),
        label: b.getAttribute('aria-label'),
        w: b.getBoundingClientRect().width,
        h: b.getBoundingClientRect().height,
      })),
      cardRadius: getComputedStyle(document.querySelector('#glass-card') ?? document.body).borderRadius,
    };
  });
  for (const b of r.btns) {
    assert(b.pressed !== null, `#${b.id} missing aria-pressed`);
    assert(b.label && b.label.length > 2, `#${b.id} missing aria-label`);
    assert(b.w >= 44 && b.h >= 44, `#${b.id} hit area ${b.w}x${b.h} < 44px`);
  }
  // keyboard reachability
  await page.keyboard.press('Tab');
  let hops = 0;
  while (hops < 8) {
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    if (id === 'btn-music' || id === 'btn-replay') break;
    await page.keyboard.press('Tab');
    hops++;
  }
  const reached = await page.evaluate(() => document.activeElement?.id ?? '');
  assert(reached === 'btn-music' || reached === 'btn-replay', `dock buttons not reachable by Tab (stopped at "${reached}")`);
  const outline = await page.evaluate(() => {
    const el = document.querySelector('#btn-music');
    el.focus();
    const cs = getComputedStyle(el);
    return `${cs.outlineStyle} ${cs.outlineWidth}`;
  });
  assert(!/none/.test(outline), `focused button has no visible outline (${outline})`);
});

check('glass', async ({ page }) => {
  const r = await page.evaluate(() => {
    const card = document.querySelector('#glass-card');
    if (!card) return { tier: null };
    const cs = getComputedStyle(card);
    const filters = [...document.querySelectorAll('filter')];
    const disp = filters.find((f) => f.querySelector('feDisplacementMap'));
    return {
      tier: document.documentElement.dataset.glassTier ?? null,
      htmlTier: document.documentElement.getAttribute('data-glass-tier'),
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '',
      radius: cs.borderRadius,
      hasFilter: !!disp,
      srgb: disp?.getAttribute('color-interpolation-filters') ?? null,
    };
  });
  assert(r.tier, 'data-glass-tier missing on <html>');
  assert(['refract', 'blur', 'solid'].includes(r.tier), `unknown tier ${r.tier}`);
  assert(r.backdrop.includes('blur('), `backdrop-filter has no blur: "${r.backdrop}"`);
  if (r.tier === 'refract') {
    assert(r.backdrop.includes('url('), `refract tier without url() filter: "${r.backdrop}"`);
    assert(r.hasFilter, 'no feDisplacementMap filter in DOM');
    assert(r.srgb === 'sRGB', `filter color-interpolation-filters=${r.srgb}, must be sRGB`);
  }
  assert(parseFloat(r.radius) > 0, `card border-radius ${r.radius}`);
});

check('copy', async ({ page }) => {
  const text = page.locator('#text1');
  await text.waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForFunction(() => (document.querySelector('#text1')?.textContent ?? '').includes('chính mình'), null, { timeout: 15000 })
    .catch(() => { throw new Error('typewriter did not finish within 15s'); });
  const len = await page.evaluate(() => document.querySelector('#text1').textContent.trim().length);
  assert(len >= 80, `typed text too short: ${len}`);
  const replay = await page.evaluate(() => typeof window.__thg?.replay === 'function');
  assert(replay, 'window.__thg.replay missing');
  await page.evaluate(() => window.__thg.replay());
  await page.waitForFunction(() => (document.querySelector('#text1')?.textContent ?? '').includes('chính mình'), null, { timeout: 15000 })
    .catch(() => { throw new Error('replay did not complete within 15s'); });
});

check('music', async ({ page }) => {
  const btn = page.locator('#btn-music');
  const before = await btn.getAttribute('aria-pressed');
  await btn.click();
  await page.waitForTimeout(300);
  const after = await btn.getAttribute('aria-pressed');
  const paused = await page.evaluate(() => document.querySelector('#bgMusic').paused);
  assert(before !== after, `aria-pressed did not change (${before} -> ${after})`);
  assert(paused === false, 'audio still paused after enabling music');
  await btn.click();
  await page.waitForTimeout(300);
  const paused2 = await page.evaluate(() => document.querySelector('#bgMusic').paused);
  assert(paused2 === true, 'audio still playing after disabling music');
  const setOk = await page.evaluate(async () => {
    if (typeof window.__thg?.setMusic !== 'function') return false;
    await window.__thg.setMusic(true);
    return !document.querySelector('#bgMusic').paused;
  });
  assert(setOk, 'window.__thg.setMusic did not start playback');
});

check('heart', async ({ page }) => {
  const r = await page.evaluate(() => {
    const c = document.querySelector('#bg-heart');
    const fb = document.querySelector('#heart-fallback');
    return {
      canvas: !!c,
      w: c?.getBoundingClientRect().width ?? 0,
      h: c?.getBoundingClientRect().height ?? 0,
      fallbackShown: fb ? getComputedStyle(fb).display !== 'none' : null,
      points: window.__thg?.heartPoints ?? null,
    };
  });
  assert(r.canvas, '#bg-heart canvas missing');
  assert(r.w > 0 && r.h > 0, `canvas has no size (${r.w}x${r.h})`);
  assert(r.points !== null, 'window.__thg.heartPoints missing');
  assert(r.points <= 120000, `too many particles: ${r.points}`);
});

check('console', async () => {
  const real = consoleErrors.filter((e) => !/favicon\.ico/i.test(e));
  assert(real.length === 0, `console errors:\n  - ${real.slice(0, 5).join('\n  - ')}`);
});

// ----------------------------------------------------------------- run ----

for (const [name, fn] of Object.entries(CHECKS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  try {
    await fn({ page: desktop, mobile });
    results.push([name, 'PASS', '']);
  } catch (e) {
    results.push([name, 'FAIL', e.message]);
  }
}

await mkdir(SHOTS, { recursive: true });
await desktop.screenshot({ path: `${SHOTS}/desktop-1440x900.png` });
await mobile.screenshot({ path: `${SHOTS}/mobile-390x844.png` });

await browser.close();

let failed = 0;
for (const [name, status, msg] of results) {
  console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'}  ${name}${msg ? '  -> ' + msg : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
