// Verify harness for THG — dev-only. Uses the locally installed Edge (no browser download).
//   node scripts/verify.mjs                 -> run every check, write .tmp/shots/*.png
//   node scripts/verify.mjs --only=glass    -> run a subset
// Exit code = number of failed checks.
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

/** Minimal static server so `node scripts/verify.mjs` needs nothing installed. */
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
const IGNORED_ERROR_PAGES = new WeakSet();

const CHECKS = {};
/** Register a check. `fn` receives { page, mobile } and throws on failure. */
const check = (name, fn) => { CHECKS[name] = fn; };

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Mean sRGB of a screenshot region, measured by the browser itself. */
async function meanColor(page, pngBuffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let r = 0, g2 = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g2 += data[i + 1]; b += data[i + 2]; }
    return [r / n, g2 / n, b / n];
  }, pngBuffer.toString('base64'));
}

const relLuminance = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const contrastRatio = (a, b) => {
  const l1 = relLuminance(a);
  const l2 = relLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const browser = await chromium.launch({ channel: 'msedge' });

const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const desktop = await desktopCtx.newPage();
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const mobile = await mobileCtx.newPage();
const reducedCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const reduced = await reducedCtx.newPage();
const solidCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const solid = await solidCtx.newPage();

// no-JS: the page must still read and still show a heart
const nojsCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
const nojs = await nojsCtx.newPage();

// CDN down: the page must keep its interactions
const offlineCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await offlineCtx.route('**esm.sh**', (route) => route.abort());
const offline = await offlineCtx.newPage();
// the offline page is *supposed* to fail its CDN requests
IGNORED_ERROR_PAGES.add(offline);

// landscape phone: the dock must not sit on top of the card
const landscapeCtx = await browser.newContext({ viewport: { width: 740, height: 360 } });
const landscape = await landscapeCtx.newPage();

// prefers-reduced-transparency: everything translucent must go opaque
const transparencyCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const transparency = await transparencyCtx.newPage();
const transparencyCdp = await transparencyCtx.newCDPSession(transparency);
await transparencyCdp.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
});

for (const p of [desktop, mobile, reduced, solid, nojs, offline, landscape, transparency]) {
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ page: p, text: `${m.text()} @ ${m.location().url ?? ''}` }); });
  p.on('pageerror', (e) => consoleErrors.push({ page: p, text: 'pageerror: ' + String(e) + ' @ ' + (e.stack ?? '').split('\n')[0] }));
}

await desktop.goto(BASE, { waitUntil: 'domcontentloaded' });
await mobile.goto(BASE, { waitUntil: 'domcontentloaded' });
await reduced.goto(BASE, { waitUntil: 'domcontentloaded' });
await solid.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'tier=solid', { waitUntil: 'domcontentloaded' });
await nojs.goto(BASE, { waitUntil: 'domcontentloaded' });
await offline.goto(BASE, { waitUntil: 'domcontentloaded' });
await landscape.goto(BASE, { waitUntil: 'domcontentloaded' });
await transparency.goto(BASE, { waitUntil: 'domcontentloaded' });
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
  assert(r.title !== 'A mysterious gift for you', `stale title: ${r.title}`);

  // the message must be in the markup, not only typed in by JS
  const html = await (await page.request.get(BASE)).text();
  const h1 = html.match(/<h1[^>]*id="text1"[^>]*>([\s\S]*?)<\/h1>/);
  const message = (h1?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  assert(message.length >= 80, `message in markup is only ${message.length} chars`);
  assert(message.includes('20/10'), 'message does not mention 20/10');
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
    assert(b.label && b.label.length > 2, `#${b.id} missing aria-label`);
    assert(b.w >= 44 && b.h >= 44, `#${b.id} hit area ${b.w}x${b.h} < 44px`);
    if (b.id === 'btn-music') assert(b.pressed !== null, '#btn-music missing aria-pressed');
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
      hasBlur: !!disp?.querySelector('feGaussianBlur'),
      srgb: disp?.getAttribute('color-interpolation-filters') ?? null,
    };
  });
  assert(r.tier, 'data-glass-tier missing on <html>');
  assert(['refract', 'blur', 'solid'].includes(r.tier), `unknown tier ${r.tier}`);
  if (r.tier === 'refract') {
    assert(r.backdrop.includes('url('), `refract tier without url() filter: "${r.backdrop}"`);
    assert(r.hasFilter, 'no feDisplacementMap filter in DOM');
    assert(r.srgb === 'sRGB', `filter color-interpolation-filters=${r.srgb}, must be sRGB`);
    assert(r.hasBlur, 'filter chain has no feGaussianBlur (frost must live inside the filter)');
  } else {
    assert(r.backdrop.includes('blur('), `backdrop-filter has no blur: "${r.backdrop}"`);
  }
  assert(parseFloat(r.radius) > 0, `card border-radius ${r.radius}`);

  // pointer tracking + shimmer
  const btn = page.locator('#btn-music');
  await btn.hover();
  await page.waitForTimeout(120);
  const lx = await page.evaluate(() => getComputedStyle(document.querySelector('#btn-music')).getPropertyValue('--lg-x').trim());
  assert(lx !== '', 'hover did not set --lg-x (pointer specular)');
  await btn.click({ force: true });
  const shimmer = await page.evaluate(() => document.querySelector('#btn-music').classList.contains('is-shimmer'));
  assert(shimmer, 'click did not trigger the shimmer sweep');

  // forced solid tier: no refraction, opaque enough to read text on
  const s = await solid.evaluate(() => {
    const card = document.querySelector('#glass-card');
    const cs = getComputedStyle(card);
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const parts = (m ? m[1] : '0,0,0,0').split(',').map((v) => parseFloat(v));
    return { tier: document.documentElement.dataset.glassTier, backdrop: cs.backdropFilter, alpha: parts.length > 3 ? parts[3] : 1 };
  });
  assert(s.tier === 'solid', `forced tier=solid but tier is ${s.tier}`);
  assert(!s.backdrop.includes('url('), `solid tier still uses a filter: ${s.backdrop}`);
  assert(s.alpha >= 0.85, `solid tier background alpha ${s.alpha} < 0.85`);
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

  // reduced motion: the full message must be there immediately, not typed out
  const reducedLen = await reduced.evaluate(() => (document.querySelector('#text1')?.textContent ?? '').trim().length);
  assert(reducedLen >= 80, `reduced-motion page shows only ${reducedLen} chars (should be the full message)`);
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

check('contrast', async ({ page }) => {
  const targets = ['.msg__title', '.msg__body'];
  await page.evaluate((sels) => {
    for (const s of sels) document.querySelector(s).style.visibility = 'hidden';
  }, targets);

  const measured = [];
  for (const sel of targets) {
    const box = await page.locator(sel).boundingBox();
    const shot = await page.screenshot({ clip: box });
    const bg = await meanColor(page, shot);
    const style = await page.evaluate((s) => {
      const cs = getComputedStyle(document.querySelector(s));
      return { color: cs.color, fontSize: parseFloat(cs.fontSize) };
    }, sel);
    const m = style.color.match(/rgba?\(([^)]+)\)/);
    const parts = (m ? m[1] : '255,255,255').split(',').map((v) => parseFloat(v));
    const alpha = parts.length > 3 ? parts[3] : 1;
    // composite the (possibly translucent) text colour over the measured backdrop
    const fg = parts.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
    const ratio = contrastRatio(fg, bg);
    measured.push({ sel, ratio: Math.round(ratio * 100) / 100, size: style.fontSize, alpha });
  }

  await page.evaluate((sels) => {
    for (const s of sels) document.querySelector(s).style.visibility = '';
  }, targets);

  for (const m of measured) {
    const large = m.size >= 24 || (m.size >= 18.66);
    const min = large ? 3 : 4.5;
    assert(m.ratio >= min, `${m.sel} contrast ${m.ratio}:1 (needs ${min}:1, size ${m.size}px)`);
  }
  return Object.fromEntries(measured.map((m) => [m.sel, `${m.ratio}:1@${m.size}px`]));
});

check('motion', async ({ page }) => {
  const frames = await page.evaluate(() => window.__thg?.frames ?? 0);
  assert(frames > 0, 'heart never rendered a frame');

  const before = await reduced.evaluate(() => window.__thg?.frames ?? 0);
  await reduced.waitForTimeout(900);
  const after = await reduced.evaluate(() => window.__thg?.frames ?? 0);
  assert(before === after, `reduced-motion page still animating (frames ${before} -> ${after})`);
  const flag = await reduced.evaluate(() => window.__thg?.reducedMotion === true);
  assert(flag, 'reduced-motion context did not report reducedMotion');
});

check('icons', async ({ page }) => {
  const visible = async () => page.evaluate(() => {
    const btn = document.querySelector('#btn-music');
    return [...btn.querySelectorAll('svg[data-icon]')]
      .filter((s) => getComputedStyle(s).display !== 'none')
      .map((s) => s.dataset.icon);
  });

  await page.evaluate(() => window.__thg.setMusic(false));
  await page.waitForTimeout(250);
  const paused = await visible();
  assert(paused.length === 1, `expected 1 visible icon when paused, got [${paused}]`);
  assert(paused[0] === 'play', `paused state shows "${paused[0]}"`);

  await page.evaluate(() => window.__thg.setMusic(true));
  await page.waitForTimeout(250);
  const playing = await visible();
  assert(playing.length === 1, `expected 1 visible icon when playing, got [${playing}]`);
  assert(playing[0] === 'pause', `playing state shows "${playing[0]}"`);
});

check('offline', async () => {
  await offline.waitForTimeout(800);
  const hasApi = await offline.evaluate(() => typeof window.__thg?.replay === 'function' && typeof window.__thg?.setMusic === 'function');
  assert(hasApi, 'CDN down: window.__thg missing (whole module died with the three.js import)');
  const fallbackVisible = await offline.evaluate(() => {
    const fb = document.querySelector('#heart-fallback');
    return fb ? getComputedStyle(fb).display !== 'none' : false;
  });
  assert(fallbackVisible, 'CDN down: heart fallback not shown');
  await offline.locator('#btn-music').click();
  await offline.waitForTimeout(200);
  const pressed = await offline.locator('#btn-music').getAttribute('aria-pressed');
  assert(pressed === 'true', `CDN down: music button did not toggle (aria-pressed=${pressed})`);
});

check('nojs', async () => {
  const text = await nojs.evaluate(() => document.querySelector('#text1')?.textContent?.trim().length ?? 0);
  assert(text >= 80, `no-JS: message not readable (${text} chars)`);
  const fallbackVisible = await nojs.evaluate(() => {
    const fb = document.querySelector('#heart-fallback');
    return fb ? getComputedStyle(fb).display !== 'none' : false;
  });
  assert(fallbackVisible, 'no-JS: heart fallback not visible');
});

check('transparency', async () => {
  await transparency.waitForTimeout(600);
  const r = await transparency.evaluate(() => {
    const btn = document.querySelector('#btn-music');
    const card = document.querySelector('#glass-card');
    const alphaOf = (el) => {
      const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/);
      const p = (m ? m[1] : '0,0,0,0').split(',').map((v) => parseFloat(v));
      return p.length > 3 ? p[3] : 1;
    };
    return {
      tier: document.documentElement.dataset.glassTier,
      cardBackdrop: getComputedStyle(card).backdropFilter,
      cardAlpha: alphaOf(card),
      btnBackdrop: getComputedStyle(btn).backdropFilter,
      btnAlpha: alphaOf(btn),
    };
  });
  assert(r.tier === 'solid', `reduced-transparency tier is ${r.tier}`);
  assert(!r.cardBackdrop.includes('blur('), `card still blurred: ${r.cardBackdrop}`);
  assert(r.cardAlpha >= 0.85, `card alpha ${r.cardAlpha} < 0.85`);
  assert(!r.btnBackdrop.includes('blur('), `dock button still blurred: ${r.btnBackdrop}`);
  assert(r.btnAlpha >= 0.85, `dock button alpha ${r.btnAlpha} < 0.85`);
});

check('landscape', async () => {
  await landscape.waitForTimeout(600);
  const boxes = await landscape.evaluate(() => {
    const card = document.querySelector('#glass-card').getBoundingClientRect();
    const dock = document.querySelector('#dock').getBoundingClientRect();
    return { card: { l: card.left, r: card.right, t: card.top, b: card.bottom }, dock: { l: dock.left, r: dock.right, t: dock.top, b: dock.bottom } };
  });
  const overlap = boxes.card.l < boxes.dock.r && boxes.dock.l < boxes.card.r && boxes.card.t < boxes.dock.b && boxes.dock.t < boxes.card.b;
  assert(!overlap, `dock overlaps the card in landscape: card=${JSON.stringify(boxes.card)} dock=${JSON.stringify(boxes.dock)}`);
  const scroll = await landscape.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert(scroll, 'landscape viewport scrolls horizontally');
});

check('console', async () => {
  const real = consoleErrors
    .filter((e) => !IGNORED_ERROR_PAGES.has(e.page))
    .map((e) => e.text)
    .filter((t) => !/favicon\.ico/i.test(t));
  assert(real.length === 0, `console errors:\n  - ${real.slice(0, 5).join('\n  - ')}`);
});

// ----------------------------------------------------------------- run ----

for (const [name, fn] of Object.entries(CHECKS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  try {
    const detail = await fn({ page: desktop, mobile });
    const note = detail && typeof detail === 'object'
      ? Object.entries(detail).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ')
      : (typeof detail === 'string' ? detail : '');
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
  console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'}  ${name}${msg ? '  -> ' + msg : ''}`);
  if (status !== 'PASS') failed++;
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
