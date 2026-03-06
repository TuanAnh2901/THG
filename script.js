import * as THREE from "https://cdn.skypack.dev/three@0.136.0";
import {OrbitControls} from "https://cdn.skypack.dev/three@0.136.0/examples/jsm/controls/OrbitControls";

console.clear();

// Tự động phát nhạc khi trang load
// Trình duyệt yêu cầu tương tác người dùng trước khi phát audio,
// nên lắng nghe sự kiện tương tác đầu tiên để resume
const bgMusic = document.getElementById("bgMusic");
bgMusic.volume = 0.9;

const resumeAudio = () => {
  bgMusic.play();
  document.removeEventListener("click", resumeAudio);
  document.removeEventListener("keydown", resumeAudio);
  document.removeEventListener("touchstart", resumeAudio);
  document.removeEventListener("touchend", resumeAudio);
  document.removeEventListener("touchmove", resumeAudio);
  document.removeEventListener("visibilitychange", resumeAudio);
};

setTimeout(() => {
  bgMusic.play().catch(() => {
    document.addEventListener("click", resumeAudio);
    document.addEventListener("keydown", resumeAudio);
    document.addEventListener("touchstart", resumeAudio);
    document.addEventListener("touchend", resumeAudio);
    document.addEventListener("touchmove", resumeAudio);
    document.addEventListener("visibilitychange", resumeAudio);
  });
}, 2000);

// Toggle nhạc thủ công
const musicToggle = document.getElementById("musicToggle");
const updateMusicButton = () => {
  if (bgMusic.paused) {
    musicToggle.textContent = "▶";
  } else {
    musicToggle.textContent = "⏸";
  }
};
musicToggle.addEventListener("click", () => {
  if (bgMusic.paused) {
    bgMusic.play();
  } else {
    bgMusic.pause();
  }
  updateMusicButton();
});
bgMusic.addEventListener("play", updateMusicButton);
bgMusic.addEventListener("pause", updateMusicButton);

let scene = new THREE.Scene();
scene.background = new THREE.Color(0x160016);
let camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 1000);
camera.position.set(0, 4, 21);
let renderer = new THREE.WebGLRenderer();
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
window.addEventListener("resize", event => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
})

let controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

let gu = {
  time: {value: 0}
}

let sizes = [];
let shift = [];
let pushShift = () => {
  shift.push(
    Math.random() * Math.PI, 
    Math.random() * Math.PI * 2, 
    (Math.random() * 0.9 + 0.1) * Math.PI * 0.1,
    Math.random() * 0.9 + 0.1
  );
}
// Lấy mẫu theo diện tích để giảm dồn hạt ở trục giữa trái tim
function sampleHeartT() {
  while (true) {
    let t = Math.random() * Math.PI * 2;
    let radialRatio = Math.abs(Math.pow(Math.sin(t), 3));
    let keepChance = THREE.MathUtils.lerp(0.03, 1, radialRatio);
    if (Math.random() < keepChance) {
      return t;
    }
  }
}

function heartPoint() {
  let t = sampleHeartT();
  let scale = 0.62;
  let fill = Math.sqrt(Math.random());
  let radialNoise = 0.94 + Math.random() * 0.12;
  let xEdge = 16 * Math.pow(Math.sin(t), 3) * radialNoise;
  let yEdge = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  let x = xEdge * fill * scale;
  let y = yEdge * fill * scale * 1.25 + (Math.random() - 0.5) * 0.1;
  let depth = 1.2 + (1 - fill) * 6.0;
  let z = (Math.random() - 0.5) * depth;
  return new THREE.Vector3(x, y, z);
}

let pts = new Array(25000).fill().map(p => {
  sizes.push(Math.random() * 1.5 + 0.5);
  pushShift();
  return heartPoint();
})
for(let i = 0; i < 50000; i++){
  let r = 10, R = 40;
  let rand = Math.pow(Math.random(), 1.5);
  let radius = Math.sqrt(R * R * rand + (1 - rand) * r * r);
  pts.push(new THREE.Vector3().setFromCylindricalCoords(radius, Math.random() * 2 * Math.PI, (Math.random() - 0.5) * 2 ));
  sizes.push(Math.random() * 1.5 + 0.5);
  pushShift();
}

let g = new THREE.BufferGeometry().setFromPoints(pts);
g.setAttribute("sizes", new THREE.Float32BufferAttribute(sizes, 1));
g.setAttribute("shift", new THREE.Float32BufferAttribute(shift, 4));
let m = new THREE.PointsMaterial({
  size: 0.1,
  transparent: true,
  blending: THREE.AdditiveBlending,
  onBeforeCompile: shader => {
    shader.uniforms.time = gu.time;
    shader.vertexShader = `
      uniform float time;
      attribute float sizes;
      attribute vec4 shift;
      varying vec3 vColor;
      ${shader.vertexShader}
    `.replace(
      `gl_PointSize = size;`,
      `gl_PointSize = size * sizes;`
    ).replace(
      `#include <color_vertex>`,
      `#include <color_vertex>
        float d = length(abs(position) / vec3(40., 10., 40));
        d = clamp(d, 0., 1.);
        vColor = mix(vec3(227., 155., 0.), vec3(100., 50., 255.), d) / 255.;
      `
    ).replace(
      `#include <begin_vertex>`,
      `#include <begin_vertex>
        float t = time;
        float moveT = mod(shift.x + shift.z * t, PI2);
        float moveS = mod(shift.y + shift.z * t, PI2);
        transformed += vec3(cos(moveS) * sin(moveT), cos(moveT), sin(moveS) * sin(moveT) * 0.28) * shift.a;
      `
    );
    console.log(shader.vertexShader);
    shader.fragmentShader = `
      varying vec3 vColor;
      ${shader.fragmentShader}
    `.replace(
      `#include <clipping_planes_fragment>`,
      `#include <clipping_planes_fragment>
        float d = length(gl_PointCoord.xy - 0.5);
        if (d > 0.5) discard;
      `
    ).replace(
      `vec4 diffuseColor = vec4( diffuse, opacity );`,
      `vec4 diffuseColor = vec4( vColor, smoothstep(0.5, 0.2, d) * 0.5 + 0.5 );`
    );
    console.log(shader.fragmentShader);
  }
});
let p = new THREE.Points(g, m);
p.rotation.order = "ZYX";
scene.add(p)

let clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  controls.update();
  let t = clock.getElapsedTime() * 0.5;
  gu.time.value = t * Math.PI;
  p.rotation.y = t * 0.05;
  p.rotation.x = 0;
  renderer.render(scene, camera);
});


var i = 0;
//var txt1 = "Sagi yêu dấu...! <Nhưng không hề đầu gấu, <<Sagi babi...!  <Nhưng không hề chi li.  <<Sagi thân mến...! <Nhưng không thích chơi nến.     <<Sagi slay...     <Chắc là có straight =))))) <<Sagi Sagi...!   <Cái tên thật mê li, mê li....";
var txt1 = "Chúc em có 1 ngày 8/3 vui vẻ nhé! ❤️. <Luv you!";
var speed = 50;
typeWriter();
function typeWriter() {
  bgMusic.play().catch(() => {});
  if (i < txt1.length) {
     if(txt1.charAt(i)=='<')
      document.getElementById("text1").innerHTML += '</br>'
    else if(txt1.charAt(i)=='>')
      document.getElementById("text1").innerHTML = ''
    else if(txt1.charAt(i)=='|')
      {
        $(".bg_heart").css("");

      }
    else
      document.getElementById("text1").innerHTML += txt1.charAt(i);
    i++;
    setTimeout(typeWriter, speed);
  }
}
