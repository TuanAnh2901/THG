// Liquid Glass — physics-based refraction for the web.
//
// Ported from https://github.com/archisvaze/liquid-glass (MIT, © 2026 Archis Vaze),
// demo: https://liquid-glass-eta.vercel.app/  — the Snell-law refraction profile,
// the bezel displacement map and the specular map follow that implementation.
// Structure (SVG filter + backdrop-filter) is Chromium only; everywhere else the
// CSS blur fallback stays in place.
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

// Surface profiles: the height of the glass surface across the bezel, 0 (edge) -> 1 (flat).
const SURFACE_FNS = {
  convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25),
  convex_circle: (x) => Math.sqrt(1 - (1 - x) * (1 - x)),
  concave: (x) => 1 - Math.sqrt(1 - (1 - x) * (1 - x)),
  lip: (x) => {
    const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 0.25);
    const concave = 1 - Math.sqrt(1 - (1 - x) * (1 - x)) + 0.1;
    const t = 6 * x ** 5 - 15 * x ** 4 + 10 * x ** 3;
    return convex * (1 - t) + concave * t;
  },
};

/**
 * Refraction profile: for every step across the bezel, how far light is bent.
 * Snell's law with eta = 1/ior, sampled along the surface normal.
 */
function calculateRefractionProfile(glassThickness, bezelWidth, heightFn, ior, samples = 128) {
  const eta = 1 / ior;
  const refract = (nx, ny) => {
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const sq = Math.sqrt(k);
    return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
  };

  const profile = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = heightFn(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = heightFn(x + dx);
    const deriv = (y2 - y) / dx;
    const mag = Math.sqrt(deriv * deriv + 1);
    const ref = refract(-deriv / mag, -1 / mag);
    if (!ref) { profile[i] = 0; continue; }
    profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
  }
  return profile;
}

/** Displacement map: a ring around the edge that pushes the backdrop sideways. */
function generateDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 128; d[i + 1] = 128; d[i + 2] = 0; d[i + 3] = 255;
  }

  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wB = w - r * 2;
  const hB = h - r * 2;
  const S = profile.length;

  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
      const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;
      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      const cos = x / dist;
      const sin = y / dist;
      const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
      const disp = profile[bi] || 0;
      const dX = (-cos * disp) / maxDisp;
      const dY = (-sin * disp) / maxDisp;
      const idx = (y1 * w + x1) * 4;
      d[idx] = (128 + dX * 127 * op + 0.5) | 0;
      d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** Specular map: a directional highlight along the rim, like light catching the edge. */
function generateSpecularMap(w, h, radius, bezelWidth, angle = Math.PI / 3) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  d.fill(0);

  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wB = w - r * 2;
  const hB = h - r * 2;
  const sv = [Math.cos(angle), Math.sin(angle)];

  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
      const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;
      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      const cos = x / dist;
      const sin = -y / dist;
      const dot = Math.abs(cos * sv[0] + sin * sv[1]);
      const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) ** 2));
      const coeff = dot * edge;
      const col = (255 * coeff) | 0;
      const alpha = (col * coeff * op) | 0;
      const idx = (y1 * w + x1) * 4;
      d[idx] = col;
      d[idx + 1] = col;
      d[idx + 2] = col;
      d[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const DEFAULTS = {
  radius: 26,
  thickness: 60,     // how deep the glass is
  bezel: 24,          // width of the refracting rim
  ior: 2.4,           // index of refraction
  scale: 1.0,         // strength multiplier
  blur: 0.4,          // frost on the backdrop
  specularOpacity: 0.5,
  specularSaturation: 4,
  surface: 'convex_squircle',
  lightAngle: Math.PI / 3,
};

/**
 * Build the glass material on an element. The filter refracts the live backdrop,
 * so it is rebuilt whenever the element changes size.
 */
export function attachGlass(el, options = {}) {
  const opts = { ...DEFAULTS, ...options };

  if (!CSS.supports('backdrop-filter', 'url(#a)')) {
    return { supported: false, update() {}, destroy() {} };
  }

  const id = `liquid-glass-${Math.random().toString(36).slice(2, 9)}`;
  const host = document.getElementById('glass-host') || document.body;
  const svg = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  const defs = svgEl('defs');
  const filter = svgEl('filter', { id, x: '0%', y: '0%', width: '100%', height: '100%' });
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  defs.appendChild(filter);
  svg.appendChild(defs);
  host.appendChild(svg);

  const build = () => {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (w < 2 || h < 2) return;

    const radius = Math.floor(Math.min(opts.radius, w / 2, h / 2));
    const bezel = Math.max(1, Math.min(opts.bezel, radius - 1, Math.min(w, h) / 2 - 1));
    const heightFn = SURFACE_FNS[opts.surface] ?? SURFACE_FNS.convex_squircle;

    const profile = calculateRefractionProfile(opts.thickness, bezel, heightFn, opts.ior, 128);
    const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
    const dispUrl = generateDisplacementMap(w, h, radius, bezel, profile, maxDisp);
    const specUrl = generateSpecularMap(w, h, radius, bezel * 2.5, opts.lightAngle);
    const scale = maxDisp * opts.scale;

    filter.replaceChildren();

    filter.appendChild(svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: opts.blur, result: 'blurred_source' }));
    const disp = svgEl('feImage', { href: dispUrl, x: 0, y: 0, width: w, height: h, result: 'disp_map' });
    disp.setAttributeNS(XLINK_NS, 'xlink:href', dispUrl);
    filter.appendChild(disp);
    filter.appendChild(svgEl('feDisplacementMap', {
      in: 'blurred_source', in2: 'disp_map', scale,
      xChannelSelector: 'R', yChannelSelector: 'G', result: 'displaced',
    }));
    filter.appendChild(svgEl('feColorMatrix', { in: 'displaced', type: 'saturate', values: opts.specularSaturation, result: 'displaced_sat' }));
    const spec = svgEl('feImage', { href: specUrl, x: 0, y: 0, width: w, height: h, result: 'spec_layer' });
    spec.setAttributeNS(XLINK_NS, 'xlink:href', specUrl);
    filter.appendChild(spec);
    filter.appendChild(svgEl('feComposite', { in: 'displaced_sat', in2: 'spec_layer', operator: 'in', result: 'spec_masked' }));
    const transfer = svgEl('feComponentTransfer', { in: 'spec_layer', result: 'spec_faded' });
    transfer.appendChild(svgEl('feFuncA', { type: 'linear', slope: opts.specularOpacity }));
    filter.appendChild(transfer);
    filter.appendChild(svgEl('feBlend', { in: 'spec_masked', in2: 'displaced', mode: 'normal', result: 'with_sat' }));
    filter.appendChild(svgEl('feBlend', { in: 'spec_faded', in2: 'with_sat', mode: 'normal' }));

    el.style.backdropFilter = `url(#${id})`;
    el.style.webkitBackdropFilter = `url(#${id})`;
  };

  build();

  let timer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(build, 150);
  });
  ro.observe(el);

  /* ------------------------------------------------------------ physics */

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const onMove = (e) => {
    if (reduceMotion.matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lg-x', ((e.clientX - r.left) / r.width).toFixed(4));
    el.style.setProperty('--lg-y', ((e.clientY - r.top) / r.height).toFixed(4));
    el.style.setProperty('--lg-hover', '1');
  };
  const onLeave = () => el.style.setProperty('--lg-hover', '0');
  const onClick = () => {
    if (reduceMotion.matches) return;
    el.classList.add('is-shimmer');
    setTimeout(() => el.classList.remove('is-shimmer'), 700);
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('click', onClick);

  return {
    supported: true,
    update: build,
    destroy() {
      clearTimeout(timer);
      ro.disconnect();
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('click', onClick);
      svg.remove();
    },
  };
}

function boot() {
  for (const el of document.querySelectorAll('[data-glass]')) {
    const raw = el.dataset.glass === '' ? {} : JSON.parse(el.dataset.glass);
    attachGlass(el, raw);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
