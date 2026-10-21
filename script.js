// THG — 20/10 gift page. Typewriter, music and the heart.

const textEl = document.getElementById('text1');
const FULL_TEXT = textEl ? textEl.textContent.trim() : '';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------- typewriter */

let charIndex = 0;
let timer = 0;

function typeNext() {
  if (charIndex >= FULL_TEXT.length) {
    timer = 0;
    return;
  }
  textEl.textContent = FULL_TEXT.slice(0, ++charIndex);
  timer = setTimeout(typeNext, 35);
}

function playFromStart() {
  clearTimeout(timer);
  charIndex = 0;
  textEl.textContent = '';
  if (reduceMotion.matches) {
    textEl.textContent = FULL_TEXT;
    charIndex = FULL_TEXT.length;
    return;
  }
  typeNext();
}

if (textEl) playFromStart();

/* ----------------------------------------------------------------- music */

const bgMusic = document.getElementById('bgMusic');
const musicBtn = document.getElementById('btn-music');
const replayBtn = document.getElementById('btn-replay');

bgMusic.volume = 0.55;

function paintMusicButton() {
  const playing = !bgMusic.paused;
  musicBtn.setAttribute('aria-pressed', String(playing));
  musicBtn.setAttribute('aria-label', playing ? 'Tắt nhạc' : 'Bật nhạc');
  musicBtn.classList.toggle('is-playing', playing);
}

function setMusic(on) {
  if (on) {
    const p = bgMusic.play();
    if (p?.catch) p.catch(() => { /* browser refused autoplay; the click handler will retry */ });
  } else {
    bgMusic.pause();
  }
  paintMusicButton();
}

// Browsers block autoplay until the user interacts; retry on the first gesture.
bgMusic.play().then(paintMusicButton).catch(() => {
  const resume = () => {
    bgMusic.play().then(paintMusicButton).catch(() => {});
    for (const evt of ['click', 'keydown', 'touchstart', 'touchend']) {
      window.removeEventListener(evt, resume);
    }
  };
  for (const evt of ['click', 'keydown', 'touchstart', 'touchend']) {
    window.addEventListener(evt, resume, { once: true });
  }
  paintMusicButton();
});

musicBtn.addEventListener('click', () => setMusic(bgMusic.paused));
bgMusic.addEventListener('play', paintMusicButton);
bgMusic.addEventListener('pause', paintMusicButton);
paintMusicButton();

/* ------------------------------------------------------------------ dock */

// The card ignores the pointer so drags reach the canvas; feed its specular
// highlight from the global pointer position instead.
const cardEl = document.getElementById('glass-card');
if (cardEl) {
  window.addEventListener('pointermove', (e) => {
    const r = cardEl.getBoundingClientRect();
    cardEl.style.setProperty('--lg-x', ((e.clientX - r.left) / r.width).toFixed(4));
    cardEl.style.setProperty('--lg-y', ((e.clientY - r.top) / r.height).toFixed(4));
  }, { passive: true });
}

replayBtn.addEventListener('click', () => {
  playFromStart();
});

/* ----------------------------------------------------------------- heart */

const canvas = document.getElementById('bg-heart');
const fallback = document.getElementById('heart-fallback');
const isSmall = () => window.innerWidth < 640;
// the glass filter re-samples the backdrop every frame, so the pixel budget matters
const PIXEL_RATIO = () => Math.min(devicePixelRatio, isSmall() ? 1 : 1.25);

async function startHeart() {
  if (!canvas) return;
  let THREE;
  let OrbitControls;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  } catch {
    // CDN unreachable: keep the page interactive, show the CSS heart instead
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return;
  }
  if (!renderer.getContext()) {
    return;
  }
  fallback.hidden = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 1000);
  camera.position.set(0, 4, 21);

  renderer.setPixelRatio(PIXEL_RATIO());
  renderer.setSize(innerWidth, innerHeight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  // zoom stays on, like the 8/3 version
  controls.enableZoom = true;
  controls.minDistance = 12;
  controls.maxDistance = 120;
  // the camera stays put — the *planet* spins, like a body with a ring belt
  controls.autoRotate = false;

  const uniforms = { time: { value: 0 } };
  const sizes = [];
  const shift = [];
  const pushShift = () => {
    shift.push(
      Math.random() * Math.PI,
      Math.random() * Math.PI * 2,
      (Math.random() * 0.9 + 0.1) * Math.PI * 0.1,
      Math.random() * 0.9 + 0.1,
    );
  };

  // Sample by area so the heart does not clump on the vertical axis.
  function sampleHeartT() {
    for (;;) {
      const t = Math.random() * Math.PI * 2;
      const radialRatio = Math.abs(Math.pow(Math.sin(t), 3));
      const keepChance = THREE.MathUtils.lerp(0.03, 1, radialRatio);
      if (Math.random() < keepChance) return t;
    }
  }

  function heartPoint() {
    const t = sampleHeartT();
    const scale = 0.52;
    const fill = Math.sqrt(Math.random());
    const radialNoise = 0.94 + Math.random() * 0.12;
    const xEdge = 16 * Math.pow(Math.sin(t), 3) * radialNoise;
    const yEdge = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const x = xEdge * fill * scale;
    const y = yEdge * fill * scale * 1.25 + (Math.random() - 0.5) * 0.1;
    const depth = 1.2 + (1 - fill) * 6.0;
    const z = (Math.random() - 0.5) * depth;
    return new THREE.Vector3(x, y, z);
  }

  // Heart + belt live in ONE point cloud (as in the 8/3 version), so the whole
  // body turns like a planet with a ring belt.
  const heartCount = isSmall() ? 60000 : 200000;
  const beltCount = isSmall() ? 30000 : 100000;
  const points = new Array(heartCount + beltCount);

  for (let i = 0; i < heartCount; i++) {
    points[i] = heartPoint();
    sizes.push(Math.random() * 1.5 + 0.5);
    pushShift();
  }

  // The belt: an evenly spaced annulus (10 -> 40 units) with a clean round hole
  // around the heart. Radius and angle are both stratified and then shuffled,
  // so the band has no clumps and no gaps.
  const BELT_INNER = 10;
  const BELT_OUTER = 40;
  const radii = new Float64Array(beltCount);
  const angles = new Float64Array(beltCount);
  for (let i = 0; i < beltCount; i++) {
    radii[i] = BELT_INNER + (BELT_OUTER - BELT_INNER) * ((i + Math.random()) / beltCount);
    angles[i] = Math.PI * 2 * ((i + Math.random()) / beltCount);
  }
  for (let i = beltCount - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = angles[i]; angles[i] = angles[j]; angles[j] = tmp;
  }
  for (let i = 0; i < beltCount; i++) {
    const radius = radii[i];
    const theta = angles[i];
    points[heartCount + i] = new THREE.Vector3(
      Math.cos(theta) * radius,
      (Math.random() - 0.5) * 3,
      Math.sin(theta) * radius,
    );
    sizes.push(Math.random() * 1.5 + 0.5);
    pushShift();
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setAttribute('sizes', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('shift', new THREE.Float32BufferAttribute(shift, 4));

  const material = new THREE.PointsMaterial({
    size: 0.08,
    transparent: true,
    blending: THREE.AdditiveBlending,
    onBeforeCompile: (shader) => {
      shader.uniforms.time = uniforms.time;
      shader.vertexShader = `
        uniform float time;
        attribute float sizes;
        attribute vec4 shift;
        varying vec3 vColor;
        ${shader.vertexShader}
      `.replace(
        'gl_PointSize = size;',
        'gl_PointSize = size * sizes;',
      ).replace(
        '#include <color_vertex>',
        `#include <color_vertex>
          // A rotationally symmetric cloud is invisible while it spins, so the
          // colour carries an asymmetric sweep along the object's X axis: the
          // planet spin is readable even though the shape is symmetric.
          // Palette rule: one channel is zero on purpose. Additive blending sums
          // the channels, so a colour with a zero channel can never blow out to
          // white — the heart stays gold, the belt stays violet.
          float radial = clamp(length(abs(position) / vec3(20., 12., 40.)), 0.0, 1.0);
          float alongX = clamp(position.x / 9.0 * 0.5 + 0.5, 0.0, 1.0);
          float grad = clamp(radial * 0.35 + alongX * 0.65, 0.0, 1.0);
          float split = smoothstep(0.42, 0.58, grad);
          vColor = mix(vec3(1.0, 0.72, 0.0), vec3(0.14, 0.05, 1.0), split);
        `,
      ).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
          float t = time;
          float moveT = mod(shift.x + shift.z * t, PI2);
          float moveS = mod(shift.y + shift.z * t, PI2);
          transformed += vec3(cos(moveS) * sin(moveT), cos(moveT), sin(moveS) * sin(moveT) * 0.28) * shift.a;
        `,
      );
      shader.fragmentShader = `
        varying vec3 vColor;
        ${shader.fragmentShader}
      `.replace(
        // in three r186 the points fragment shader declares diffuseColor *before*
        // <clipping_planes_fragment>, so the point mask has to be computed here.
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `float pd = length(gl_PointCoord.xy - 0.5);
         if (pd > 0.5) discard;
         vec4 diffuseColor = vec4( vColor, smoothstep(0.5, 0.2, pd) * 0.2 + 0.1 );`,
      );
    },
  });

  const planet = new THREE.Points(geometry, material);
  planet.rotation.order = 'ZYX';
  planet.position.set(isSmall() ? 0 : 2.2, isSmall() ? -2.5 : 0, 0);
  scene.add(planet);
  const system = planet; // the whole body turns as one

  const frameCamera = () => {
    const aspect = innerWidth / innerHeight;
    // 8/3 framing: camera at (0, 4, 21); pull back on a narrow screen
    const distance = aspect < 0.8 ? 34 : 21;
    controls.target.set(planet.position.x, 0, 0);
    camera.position.set(planet.position.x, 4, distance);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    controls.update();
  };
  frameCamera();

  const clock = new THREE.Clock();
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

  let elapsed = 0;
  const render = (dt = 0.016) => {
    elapsed += dt;
    const t = elapsed * 0.5;
    // 8/3 pacing, but fast enough to read: the cloud dances and the whole body
    // turns like a planet (a 4-minute revolution is invisible to the eye)
    uniforms.time.value = t * Math.PI * 8;
    system.rotation.y = t * 0.22;
    system.rotation.x = 0;
    renderer.render(scene, camera);
    window.__thg.frames = (window.__thg.frames ?? 0) + 1;
  };

  let last = performance.now();
  const loop = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    controls.update(dt);
    render(dt);
  };

  // Reduced motion means "no automatic motion", NOT "frozen": dragging and zooming
  // must still repaint the canvas, otherwise the scene looks broken.
  const applyMotionMode = () => {
    if (reducedQuery.matches) {
      renderer.setAnimationLoop(null);
      render(0);
    } else {
      last = performance.now();
      renderer.setAnimationLoop(loop);
    }
  };
  reducedQuery.addEventListener('change', applyMotionMode);
  controls.addEventListener('change', () => { if (reducedQuery.matches) render(0); });
  applyMotionMode();

  const onVisibility = () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else applyMotionMode();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = () => {
    renderer.setPixelRatio(PIXEL_RATIO());
    renderer.setSize(innerWidth, innerHeight);
    frameCamera();
  };
  window.addEventListener('resize', onResize);

  const onPageHide = (event) => {
    if (event.persisted) return; // bfcache restore: keep the scene alive
    renderer.setAnimationLoop(null);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
  window.addEventListener('pagehide', onPageHide);

  window.__thg.heartPoints = heartCount;
  window.__thg.beltPoints = beltCount;
  window.__thg.belt = {
    inner: BELT_INNER,
    outer: BELT_OUTER,
    meanRadius: (() => {
      let sum = 0;
      for (let i = 0; i < beltCount; i++) sum += radii[i];
      return sum / beltCount;
    })(),
  };
  window.__thg.camera = camera;
  window.__thg.controls = controls;
  window.__thg.canvas = canvas;
  window.__thg.system = system;
  window.__thg.planet = planet;
}

window.__thg = {
  ...(window.__thg ?? {}),
  replay: playFromStart,
  setMusic,
  reducedMotion: reduceMotion.matches,
  frames: 0,
};

startHeart();

