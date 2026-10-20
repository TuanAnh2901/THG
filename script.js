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

replayBtn.addEventListener('click', () => {
  playFromStart();
});

/* ----------------------------------------------------------------- heart */

const canvas = document.getElementById('bg-heart');
const fallback = document.getElementById('heart-fallback');
const isSmall = () => window.innerWidth < 640;
const PARTICLES = () => (isSmall() ? 45000 : 120000);

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
  camera.position.set(0, 3.0, 15);

  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false;

  const uniforms = { time: { value: 0 } };
  const sizes = [];
  const shift = [];

  // Sample by area so the heart does not clump on the vertical axis.
  function sampleHeartT() {
    for (;;) {
      const t = Math.random() * Math.PI * 2;
      const radialRatio = Math.abs(Math.pow(Math.sin(t), 3));
      if (Math.random() < THREE.MathUtils.lerp(0.03, 1, radialRatio)) return t;
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
    const z = (Math.random() - 0.5) * (1.2 + (1 - fill) * 6.0);
    return new THREE.Vector3(x, y, z);
  }

  const count = PARTICLES();
  const points = new Array(count);
  for (let i = 0; i < count; i++) {
    points[i] = heartPoint();
    sizes.push(Math.random() * 1.5 + 0.5);
    shift.push(
      Math.random() * Math.PI,
      Math.random() * Math.PI * 2,
      (Math.random() * 0.9 + 0.1) * Math.PI * 0.1,
      Math.random() * 0.9 + 0.1,
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setAttribute('sizes', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('shift', new THREE.Float32BufferAttribute(shift, 4));

  const material = new THREE.PointsMaterial({
    size: 0.1,
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
          float d = length(abs(position) / vec3(40., 10., 40.));
          d = clamp(d, 0., 1.);
          vColor = mix(vec3(227., 155., 0.), vec3(100., 50., 255.), d) / 255.;
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
         vec4 diffuseColor = vec4( vColor, smoothstep(0.5, 0.2, pd) * 0.26 + 0.18 );`,
      );
    },
  });

  const cloud = new THREE.Points(geometry, material);
  cloud.rotation.order = 'ZYX';
  scene.add(cloud);

  const clock = new THREE.Clock();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const render = () => {
    const t = clock.getElapsedTime() * 0.5;
    uniforms.time.value = t * Math.PI;
    cloud.rotation.y = t * 0.05;
    cloud.rotation.x = 0;
    renderer.render(scene, camera);
    window.__thg.frames = (window.__thg.frames ?? 0) + 1;
  };

  const loop = () => {
    controls.update();
    render();
  };

  if (reduced.matches) {
    render();
  } else {
    renderer.setAnimationLoop(loop);
  }

  const onVisibility = () => {
    if (reduced.matches) return;
    if (document.hidden) renderer.setAnimationLoop(null);
    else renderer.setAnimationLoop(loop);
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 2));
    renderer.setSize(innerWidth, innerHeight);
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

  window.__thg.heartPoints = count;
}

window.__thg = {
  ...(window.__thg ?? {}),
  replay: playFromStart,
  setMusic,
  reducedMotion: reduceMotion.matches,
  frames: 0,
};

startHeart();

