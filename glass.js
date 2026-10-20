// Liquid Glass engine — vanilla, no dependencies.
// Canvas generates a displacement map from a rounded-rect SDF; an SVG filter bends the
// backdrop through it; CSS backdrop-filter layers blur/tint on top.
//
// Refraction is Chromium-only (Safari/Firefox drop url() in backdrop-filter), so the
// material degrades in tiers: refract -> blur -> solid.

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MAP_MAX = 512; // longest side of the generated map, in CSS px

let uid = 0;

/* ------------------------------------------------------------------ optics */

/** Signed distance to a rounded rect centred at origin (negative inside). */
function roundedRectSdf(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** Outward normal of the rounded rect at (px, py). */
function roundedRectNormal(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const sx = Math.sign(px) || 1;
  const sy = Math.sign(py) || 1;
  if (qx > 0 || qy > 0) {
    const nx = sx * Math.max(qx, 0);
    const ny = sy * Math.max(qy, 0);
    const len = Math.hypot(nx, ny) || 1;
    return [nx / len, ny / len];
  }
  return Math.abs(qx) > Math.abs(qy) ? [sx, 0] : [0, sy];
}

/**
 * R/G carry the outward displacement vector (128 = neutral), B a rim mask.
 * Generated at the element's aspect ratio so the browser can stretch it to the
 * element box without distorting the lens.
 *
 * `fade` tapers the displacement to zero in the outermost pixels: the lens must fade
 * back to neutral before the element's clip edge, otherwise the sampled backdrop
 * snaps and the rim breaks into visible teeth.
 */
function buildMap(width, height, { radius, bezel, fade = 2 }) {
  const k = Math.min(1, MAP_MAX / Math.max(width, height));
  const w = Math.max(8, Math.round(width * k));
  const h = Math.max(8, Math.round(height * k));
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.max(0, Math.min(radius * k, Math.min(halfW, halfH)));
  const b = Math.max(1, bezel * k);
  const fadePx = Math.max(1, fade * k);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - halfW;
      const py = y + 0.5 - halfH;
      const d = roundedRectSdf(px, py, halfW, halfH, r);
      const inside = -d; // distance from the edge, positive inside
      let t = Math.max(0, Math.min(1, 1 - inside / b));
      t *= Math.max(0, Math.min(1, inside / fadePx));
      const [nx, ny] = roundedRectNormal(px, py, halfW, halfH, r);
      const i = (y * w + x) * 4;
      data[i] = Math.round(128 + nx * t * 127);
      data[i + 1] = Math.round(128 + ny * t * 127);
      data[i + 2] = Math.round(t * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL('image/png'), w, h };
}

/**
 * feDisplacementMap scale for a requested rim shift.
 * Deviation from 128 maps to scale * (ch/255 - 0.5), so the peak shift is |scale| * 0.5.
 */
function displacementScale(scale, bezel) {
  return 2 * scale * bezel;
}

/** feColorMatrix that keeps only the R, G or B channel of the input. */
function channelMatrix(keep) {
  const row = (keepIt) => (keepIt ? '1 0 0 0 0' : '0 0 0 0 0');
  const values = [
    row(keep === 'R'), row(keep === 'G'), row(keep === 'B'), '0 0 0 1 0',
  ].join(' ');
  return values;
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/* ------------------------------------------------------------------ tiers */

export function detectTier() {
  const forced = new URLSearchParams(location.search).get('tier');
  const tiers = ['refract', 'blur', 'solid'];
  if (forced && tiers.includes(forced)) {
    if (forced === 'refract' && !CSS.supports('backdrop-filter', 'url(#a)')) return 'blur';
    return forced;
  }
  if (matchMedia('(prefers-reduced-transparency: reduce)').matches) return 'solid';
  const hasFilter = CSS.supports('backdrop-filter', 'blur(2px)') || CSS.supports('-webkit-backdrop-filter', 'blur(2px)');
  if (!hasFilter) return 'solid';
  if (CSS.supports('backdrop-filter', 'url(#a)')) return 'refract';
  return 'blur';
}

/* ------------------------------------------------------------------ attach */

const DEFAULTS = {
  radius: null,
  fade: 2,
  tint: 'rgba(255,255,255,.06)',
  specular: 0.6,
  interactive: true,
  pressable: false,
  tier: 'auto',
};

/** Read a numeric token from :root (px and unitless). */
function cssNum(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Read a percentage token from :root and normalise to a ratio (180% -> 1.8). */
function cssRatio(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (raw.endsWith('%')) {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n / 100 : fallback;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function attach(el, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  // CSS tokens are the single source of truth; inline options win.
  const scale = opts.scale ?? cssNum('--lg-scale', -0.35);
  const bezel = opts.bezel ?? cssNum('--lg-bezel', 14);
  const chroma = opts.chroma ?? cssNum('--lg-chroma', 6);
  const blur = opts.blur ?? cssNum('--lg-blur', 2);
  const saturate = opts.saturate ?? cssRatio('--lg-sat', 1.8);
  const brightness = opts.brightness ?? cssNum('--lg-bright', 1.06);
  const tier = opts.tier === 'auto' ? detectTier() : opts.tier;
  document.documentElement.dataset.glassTier = tier;
  const host = document.getElementById('glass-host') || document.body;
  const id = `glass-${++uid}`;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let svg = null;
  let ro = null;
  let resizeTimer = 0;

  const readRadius = () => {
    if (opts.radius != null) return opts.radius;
    return parseFloat(getComputedStyle(el).borderRadius) || 0;
  };

  const build = () => {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (tier !== 'refract') return;

    const radius = readRadius();
    const map = buildMap(rect.width, rect.height, { radius, bezel, fade: opts.fade });
    if (svg) svg.remove();

    svg = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    const defs = svgEl('defs');
    const filter = svgEl('filter', {
      id,
      x: '-20%', y: '-20%', width: '140%', height: '140%',
      'color-interpolation-filters': 'sRGB',
    });

    const image = svgEl('feImage', { href: map.url, preserveAspectRatio: 'none', result: 'map' });
    image.setAttributeNS(XLINK_NS, 'xlink:href', map.url);
    filter.appendChild(image);

    // Displace the backdrop through the map, then frost it, then push colour.
    // Chromatic aberration: three passes at slightly different strength, one per channel.
    const pxScale = displacementScale(scale, bezel);
    const chromaRatio = chroma / 100;
    const passes = [
      { factor: 1, result: 'base' },
      { factor: 1 + chromaRatio, result: 'warm' },
      { factor: 1 - chromaRatio, result: 'cool' },
    ];
    for (const p of passes) {
      filter.appendChild(svgEl('feDisplacementMap', {
        in: 'SourceGraphic', in2: 'map', scale: pxScale * p.factor,
        xChannelSelector: 'R', yChannelSelector: 'G', result: p.result,
      }));
    }

    const base = svgEl('feColorMatrix', { type: 'matrix', values: channelMatrix('R'), in: 'base', result: 'r' });
    const warm = svgEl('feColorMatrix', { type: 'matrix', values: channelMatrix('G'), in: 'warm', result: 'g' });
    const cool = svgEl('feColorMatrix', { type: 'matrix', values: channelMatrix('B'), in: 'cool', result: 'b' });
    filter.append(base, warm, cool);

    const rg = svgEl('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' });
    const rgb = svgEl('feBlend', { in: 'rg', in2: 'b', mode: 'screen', result: 'rgb' });
    filter.append(rg, rgb);

    filter.appendChild(svgEl('feGaussianBlur', { in: 'rgb', stdDeviation: blur, result: 'frost' }));
    filter.appendChild(svgEl('feColorMatrix', { in: 'frost', type: 'saturate', values: saturate }));
    const lift = svgEl('feComponentTransfer', { result: 'lit' });
    lift.appendChild(svgEl('feFuncR', { type: 'linear', slope: brightness, intercept: 0 }));
    lift.appendChild(svgEl('feFuncG', { type: 'linear', slope: brightness, intercept: 0 }));
    lift.appendChild(svgEl('feFuncB', { type: 'linear', slope: brightness, intercept: 0 }));
    filter.appendChild(lift);

    defs.appendChild(filter);
    svg.appendChild(defs);
    host.appendChild(svg);
    el.style.setProperty('--lg-refract', `url(#${id})`);
  };

  el.style.setProperty('--lg-tint', opts.tint);
  el.style.setProperty('--lg-blur', `${blur}px`);
  el.style.setProperty('--lg-sat', `${saturate * 100}%`);
  el.style.setProperty('--lg-bright', String(brightness));

  build();
  ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });
  ro.observe(el);

  /* --------------------------------------------------------- interaction */

  const onMove = (e) => {
    if (!opts.interactive || reduceMotion.matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lg-x', ((e.clientX - r.left) / r.width).toFixed(4));
    el.style.setProperty('--lg-y', ((e.clientY - r.top) / r.height).toFixed(4));
  };
  const onDown = () => {
    if (!opts.pressable || reduceMotion.matches) return;
    el.classList.add('is-pressed');
    el.style.setProperty('--lg-press', '1');
  };
  const onUp = () => {
    el.classList.remove('is-pressed');
    el.style.setProperty('--lg-press', '0');
  };
  const onClick = () => {
    if (!opts.interactive || reduceMotion.matches) return;
    el.classList.add('is-shimmer');
    setTimeout(() => el.classList.remove('is-shimmer'), 700);
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onUp);
  el.addEventListener('click', onClick);

  return {
    tier,
    update: build,
    destroy: () => {
      clearTimeout(resizeTimer);
      ro?.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('click', onClick);
      if (svg) svg.remove();
    },
  };
}

export const LiquidGlass = { attach, detectTier };
if (typeof window !== 'undefined') window.LiquidGlass = LiquidGlass;

/* Auto-attach every [data-glass] element; each may carry its own options. */
function boot() {
  for (const el of document.querySelectorAll('[data-glass]')) {
    const raw = el.dataset.glass === '' ? {} : JSON.parse(el.dataset.glass);
    attach(el, raw);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
