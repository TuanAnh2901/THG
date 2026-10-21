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

/** Structural difference between two screenshots (downscales to kill particle jitter). */
async function coarseDiff(page, a, c) {
  return page.evaluate(async ([a64, c64]) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); return i; };
    const draw = async (img) => {
      const cv = document.createElement('canvas'); cv.width = 32; cv.height = 20;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 32, 20);
      return g.getImageData(0, 0, 32, 20).data;
    };
    const da = await draw(await load(a64)); const dc = await draw(await load(c64));
    let sum = 0;
    for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - dc[i]) + Math.abs(da[i + 1] - dc[i + 1]) + Math.abs(da[i + 2] - dc[i + 2]);
    return sum / (da.length / 4) / 3;
  }, [a.toString('base64'), c.toString('base64')]);
}

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

// drag test: its own page, reloaded between drags so damping cannot leak between them
const dragCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dragPage = await dragCtx.newPage();

// prefers-reduced-transparency: everything translucent must go opaque
const transparencyCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const transparency = await transparencyCtx.newPage();
const transparencyCdp = await transparencyCtx.newCDPSession(transparency);
await transparencyCdp.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
});

for (const p of [desktop, mobile, reduced, solid, nojs, offline, landscape, transparency, dragPage]) {
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
await dragPage.goto(BASE, { waitUntil: 'domcontentloaded' });
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
      belt: window.__thg?.beltPoints ?? null,
      beltInfo: window.__thg?.belt ?? null,
    };
  });
  assert(r.canvas, '#bg-heart canvas missing');
  assert(r.w > 0 && r.h > 0, `canvas has no size (${r.w}x${r.h})`);
  assert(r.points !== null, 'window.__thg.heartPoints missing');
  const mobile = r.w < 700;
  const maxHeart = mobile ? 60000 : 200000;
  assert(r.points <= maxHeart, `too many heart particles: ${r.points} (max ${maxHeart})`);
  const maxBelt = mobile ? 30000 : 100000;
  assert((r.belt?.count ?? r.belt ?? 0) <= maxBelt, `too many belt particles: ${r.belt?.count} (max ${maxBelt})`);
  // the belt must be a clean, evenly spaced annulus: uniform radius distribution
  // over [inner, outer] -> mean at the midpoint
  const belt = r.beltInfo;
  if (belt) {
    const mid = (belt.inner + belt.outer) / 2;
    assert(belt.outer > belt.inner, `belt has no hole (inner ${belt.inner} >= outer ${belt.outer})`);
    assert(Math.abs(belt.meanRadius - mid) < 1.5, `belt radius is not evenly spread (mean ${belt.meanRadius.toFixed(2)} vs midpoint ${mid})`);
  }
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

  // the scene must visibly move on its own: the planet spins, and the
  // downscaled frames must differ (structure change, not per-particle jitter)
  const spin0 = await page.evaluate(() => window.__thg?.system?.rotation?.y ?? null);
  assert(spin0 !== null, 'scene group not exposed on window.__thg');
  const shotA = await page.screenshot();
  await page.waitForTimeout(2000);
  const shotB = await page.screenshot();
  const spin1 = await page.evaluate(() => window.__thg?.system?.rotation?.y ?? null);
  assert(Math.abs(spin1 - spin0) > 0.01, `the planet does not spin (rotation.y ${spin0} -> ${spin1})`);

  const coarse = await coarseDiff(page, shotA, shotB);
  // a frozen scene measures ~2/255 on this downscale, a living one ~4-8
  assert(coarse > 3, `scene looks static: downscaled frame diff ${coarse.toFixed(2)}/255 (need > 3)`);

  const before = await reduced.evaluate(() => window.__thg?.frames ?? 0);
  await reduced.waitForTimeout(900);
  const after = await reduced.evaluate(() => window.__thg?.frames ?? 0);
  assert(before === after, `reduced-motion page still animating (frames ${before} -> ${after})`);
  const flag = await reduced.evaluate(() => window.__thg?.reducedMotion === true);
  assert(flag, 'reduced-motion context did not report reducedMotion');
});

check('drag', async ({ page }) => {
  const azimuth = () => page.evaluate(() => window.__thg?.controls?.getAzimuthalAngle?.() ?? null);
  const drag = async (fromX, fromY, dx, dy) => {
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.waitForTimeout(40);
    const a0 = await azimuth();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(fromX + (dx * i) / 10, fromY + (dy * i) / 10, { steps: 2 }); await page.waitForTimeout(16); }
    const a1 = await azimuth();
    await page.mouse.up();
    return Math.abs(a1 - a0);
  };

  // fresh page per drag: damping from a previous drag would otherwise leak into the next
  await dragPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await dragPage.waitForTimeout(2500);
  const card = await dragPage.locator('#glass-card').boundingBox();
  const overCard = await drag(card.x + card.width / 2, card.y + card.height / 2, 300, -40);
  assert(overCard > 0.05, `dragging over the glass card did not rotate the camera (${overCard} rad)`);

  await dragPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await dragPage.waitForTimeout(2500);
  const open = await drag(900, 450, -300, 60);
  assert(open > 0.05, `dragging the open scene did not rotate the camera (${open} rad)`);
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
  assert(boxes.card.b <= 360, `card is ${Math.round(boxes.card.b)}px tall, taller than the 360px viewport`);
  const scroll = await landscape.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert(scroll, 'landscape viewport scrolls horizontally');
});

check('tier', async ({ page }) => {
  const r = await page.evaluate(() => ({
    tier: document.documentElement.dataset.glassTier,
    ua: navigator.userAgent,
  }));
  const chromium = /Chrome|Chromium|Edg\//.test(r.ua) && !/Edge\//.test(r.ua);
  if (chromium) assert(r.tier === 'refract', `chromium should get tier refract, got ${r.tier}`);
  else assert(r.tier === 'blur' || r.tier === 'solid', `non-chromium must not use refract, got ${r.tier}`);
  return { tier: r.tier };
});

check('reduced-input', async () => {
  // reduced motion = no AUTOMATIC motion, but the scene must still react to input
  await reduced.waitForTimeout(800);
  const cam0 = await reduced.evaluate(() => window.__thg?.camera?.position?.toArray?.() ?? null);
  const shot0 = await reduced.screenshot();
  await reduced.mouse.move(900, 450);
  await reduced.mouse.down();
  for (let i = 1; i <= 10; i++) { await reduced.mouse.move(900 - i * 40, 450 + i * 6, { steps: 2 }); await reduced.waitForTimeout(16); }
  await reduced.mouse.up();
  await reduced.waitForTimeout(300);
  const cam1 = await reduced.evaluate(() => window.__thg?.camera?.position?.toArray?.() ?? null);
  const shot1 = await reduced.screenshot();
  assert(cam0 && cam1 && cam0.join() !== cam1.join(), 'reduced-motion: drag did not move the camera');
  const changed = await coarseDiff(reduced, shot0, shot1);
  assert(changed > 0.5, `reduced-motion: canvas never repaints (frame diff ${changed.toFixed(2)}/255) - the scene looks frozen`);
});

check('zoom', async ({ page }) => {
  const distance = () => page.evaluate(() => window.__thg?.controls?.getDistance?.() ?? null);
  const d0 = await distance();
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(500);
  const d1 = await distance();
  assert(d0 !== null && d1 !== null, 'controls.getDistance() unavailable');
  assert(Math.abs(d1 - d0) > 1, `mouse wheel did not zoom the scene (distance ${d0} -> ${d1})`);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(500);
  const d2 = await distance();
  assert(d2 > d1, `zoom out did not increase the distance (${d1} -> ${d2})`);
});

check('palette', async ({ page }) => {
  const shot = await page.screenshot();
  const stats = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    // skip the greeting card — white text on purpose
    const card = document.querySelector('#glass-card')?.getBoundingClientRect();
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let white = 0, gold = 0, violet = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % cv.width, py = Math.floor((i / 4) / cv.width);
      if (card && px >= card.left - 8 && px <= card.right + 8 && py >= card.top - 8 && py <= card.bottom + 8) continue;
      const r = d[i], gg = d[i + 1], bl = d[i + 2];
      if (Math.max(r, gg, bl) < 60) continue;
      lit++;
      if (Math.min(r, gg, bl) > 190) white++;
      else if (r > 110 && gg > 70 && bl < 90 && r - bl > 55) gold++;
      else if (bl > r && bl - gg > 20) violet++;
    }
    return {
      whitePct: +(100 * white / Math.max(lit, 1)).toFixed(1),
      goldPct: +(100 * gold / Math.max(lit, 1)).toFixed(1),
      violetPct: +(100 * violet / Math.max(lit, 1)).toFixed(1),
    };
  }, shot.toString('base64'));

  // the planet spins, so the gold share moves in and out of frame — the
  // regression we guard against is "no gold at all" and "everything blown to white"
  assert(stats.goldPct > 3, `no real gold in the scene (${stats.goldPct}% gold pixels)`);
  assert(stats.violetPct > 5, `no real violet in the scene (${stats.violetPct}% violet pixels)`);
  assert(stats.whitePct < 6, `too much blown-out white in the scene (${stats.whitePct}% of lit pixels)`);
  return stats;
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
