// Liquid Glass — refraction engine (step 3: displacement only, no physics yet).
// Canvas builds a displacement map from a rounded-rect SDF; an SVG filter bends the
// backdrop through it. Refraction needs Chromium (Safari/Firefox drop url() inside
// backdrop-filter) — everywhere else the CSS blur fallback stays in place.
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MAP_MAX = 512;

function roundedRectSdf(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

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
 * R/G hold the outward displacement vector (128 = neutral), B a rim mask.
 * The lens fades back to neutral at the very edge, otherwise the sampled
 * backdrop snaps and the rim breaks into visible teeth.
 */
function buildMap(width, height, { radius, bezel }) {
  const k = Math.min(1, MAP_MAX / Math.max(width, height));
  const w = Math.max(8, Math.round(width * k));
  const h = Math.max(8, Math.round(height * k));
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.max(0, Math.min(radius * k, Math.min(halfW, halfH)));
  const b = Math.max(1, bezel * k);
  const fade = Math.max(1, 2 * k);

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
      const inside = -roundedRectSdf(px, py, halfW, halfH, r);
      let t = Math.max(0, Math.min(1, 1 - inside / b));
      t *= Math.max(0, Math.min(1, inside / fade));
      const [nx, ny] = roundedRectNormal(px, py, halfW, halfH, r);
      const i = (y * w + x) * 4;
      data[i] = Math.round(128 + nx * t * 127);
      data[i + 1] = Math.round(128 + ny * t * 127);
      data[i + 2] = Math.round(t * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Bend the backdrop through the map. `scale` is negative, so the rim magnifies
 * instead of pinching (that is the Apple look).
 */
export function attachGlass(el, options = {}) {
  const opts = {
    radius: 26,
    bezel: 10,
    scale: -0.35,
    blur: 12,
    saturate: 150,
    ...options,
  };

  if (!CSS.supports('backdrop-filter', 'url(#a)')) {
    return { supported: false, update() {}, destroy() {} };
  }

  const id = `glass-${Math.random().toString(36).slice(2, 8)}`;
  const host = document.getElementById('glass-host') || document.body;
  const svg = svgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  const defs = svgEl('defs');
  const filter = svgEl('filter', {
    id,
    x: '-15%', y: '-15%', width: '130%', height: '130%',
    'color-interpolation-filters': 'sRGB',
  });
  defs.appendChild(filter);
  svg.appendChild(defs);
  host.appendChild(svg);

  const build = () => {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const radius = parseFloat(getComputedStyle(el).borderRadius) || opts.radius;
    const map = buildMap(rect.width, rect.height, { radius, bezel: opts.bezel });

    // rebuild the chain from scratch — appending would stack duplicate primitives
    filter.replaceChildren();

    const image = svgEl('feImage', { href: map, preserveAspectRatio: 'none', result: 'map' });
    image.setAttributeNS(XLINK_NS, 'xlink:href', map);
    filter.appendChild(image);

    // displacement: scale is negative -> the rim magnifies what is behind it
    filter.appendChild(svgEl('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'map',
      scale: 2 * opts.scale * opts.bezel,
      xChannelSelector: 'R', yChannelSelector: 'G',
      result: 'bent',
    }));
    filter.appendChild(svgEl('feGaussianBlur', { in: 'bent', stdDeviation: opts.blur, result: 'frost' }));
    filter.appendChild(svgEl('feColorMatrix', { in: 'frost', type: 'saturate', values: opts.saturate / 100 }));

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

  return {
    supported: true,
    update: build,
    destroy() {
      clearTimeout(timer);
      ro.disconnect();
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
