// THG — 20/10 gift page. Typewriter first; music and heart land in later tasks.

const textEl = document.getElementById('text1');
const FULL_TEXT = textEl ? textEl.textContent.trim() : '';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

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

window.__thg = {
  replay: playFromStart,
  reducedMotion: reduceMotion.matches,
};
