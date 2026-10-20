# THG 20/10 — Liquid Glass Redesign — Implementation Plan

> **Status: completed.** 14/14 verify checks pass locally and against the live site
> (https://tuananh2901.github.io/THG/). Shipped in `4abf183` + review fix pass.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa trang quà tặng `THG` từ bản 8/3 lỗi bố cục lên bản 20/10 có vật liệu Liquid Glass thật, đọc được trên desktop lẫn mobile, và deploy lên GitHub Pages.

**Architecture:** Static site 0 build step (giữ nguyên). Một file mới `glass.js` hiện thực vật liệu Liquid Glass: Canvas sinh displacement map từ SDF rounded-rect → SVG `feDisplacementMap` → `backdrop-filter: url(#…)`. Ba tier render (`refract`/`blur`/`solid`). `script.js` giữ trái tim Three.js + typewriter + nhạc. Kiểm chứng bằng `scripts/verify.mjs` (playwright-core + Edge đã cài, không tải browser).

**Tech Stack:** HTML/CSS/JS thuần (ES modules, importmap), Three.js `0.186.1` qua esm CDN, SVG filters, `playwright-core` (dev-only) để verify.

**Spec:** `docs/superpowers/specs/2026-10-20-thg-liquid-glass-design.md` — đọc song song file này; plan này là quyết định cụ thể hoá từ spec.

## Global Constraints

- Repo vẫn **static, 0 build step**: mở `index.html` là chạy. Không bundler, không webfont tải về, không framework runtime.
- **0 runtime dependency** mới. `playwright-core` chỉ là devDependency cho verify; `node_modules/` gitignored; Pages chỉ publish file tĩnh.
- **Không xóa** `music.mp3` (2.4MB) và `LICENSE.txt` (MIT, gốc CodePen `Wink196/pen/bGKgOYW`).
- **Không copy code** từ repo Liquid Glass khác — tự viết theo kỹ thuật công khai (SDF, `feDisplacementMap`, tier fallback).
- Token giá trị cố định (đọc từ spec §4.2): `--lg-blur:2px; --lg-sat:180%; --lg-bright:1.06; --lg-scale:-0.35; --lg-chroma:6px; --lg-radius:32px; --lg-bezel:14px; --lg-tint:rgba(255,255,255,.06); --lg-border:rgba(255,255,255,.13); --lg-shadow:0 24px 60px rgba(0,0,0,.45)`; màu `--bg-0:#0b0812; --bg-1:#150d20; --accent:#ff7ab6; --accent-2:#8b5cf6; --text:#f5f2f8; --text-dim:rgba(245,242,248,.72)`.
- Three.js: pin `0.186.1` (`https://esm.sh/three@0.186.1`), `OrbitControls` từ `https://esm.sh/three@0.186.1/examples/jsm/controls/OrbitControls.js`.
- Hạt: tim 120k desktop / 45k mobile. DPR cap 2 desktop / 1.5 mobile.
- Tier: `refract` | `blur` | `solid` — đặt trên `<html data-glass-tier="…">`.
- Query param `?tier=solid|blur|refract` ép tier (dùng cho test, cũng cho người dùng ép).
- File mới: `glass.js`, `scripts/verify.mjs`, `package.json`, `prototype/liquid-glass/index.html`, `README.md`, `NOTICE.md`, `.github/workflows/pages.yml`.
- File sửa: `index.html`, `style.css`, `script.js`, `.gitignore`.
- Lời nhắn 20/10 nằm trong `index.html` (không hard-code trong JS). JS chết → chữ vẫn đọc được.
- Mọi commit: tiền tố conventional (`feat|fix|chore|docs|test`), tiếng Việt hoặc Anh đều được.

## Review Focus

1. **Safari / Firefox** — không có `backdrop-filter: url()` → tier `blur`: card phải vẫn đọc được (chữ ≥ 4.5:1), không mất viền/rim. (Task 5)
2. **`prefers-reduced-transparency: reduce`** → tier `solid`: nền card phải đục, chữ vẫn đọc, không còn hiệu ứng trong suốt. (Task 5)
3. **`prefers-reduced-motion: reduce`** → lời nhắn hiện **đầy đủ ngay lập tức**, particle đứng yên, không shimmer, không physics. (Task 7, Task 10)
4. **Màn hình hẹp 320–390px** — card + dock không tràn ngang, không che chữ, dock không đè lên nút của hệ thống. (Task 2, Task 10)
5. **Không có WebGL / tab bị ẩn lâu** — fallback hiện được, không trắng màn hình, không giữ khung hình khi `document.hidden`, nhạc không kẹt ở trạng thái playing khi quay lại tab. (Task 8)

---

## File Map

| File | Trách nhiệm |
|---|---|
| `index.html` | Cấu trúc sạch (1 `<html>`, viewport, meta, OG), nội dung lời nhắn, card, dock, host cho SVG filter |
| `style.css` | Tokens, layout, typography, CSS của glass (3 tier), dock, a11y, reduced-motion |
| `glass.js` | Engine Liquid Glass: SDF canvas → SVG filter → `backdrop-filter`; tier detect; physics; shimmer |
| `script.js` | Heart (Three.js), typewriter, nhạc, wiring dock |
| `scripts/verify.mjs` | Bộ kiểm chứng: DOM/aria/tier/copy/nhạc/heart + ảnh chụp + console error |
| `package.json` | Chỉ `devDependencies: playwright-core` + script `verify` |
| `prototype/liquid-glass/index.html` | Bảng tham số kính để chốt giá trị (nhánh `prototype/liquid-glass`) |
| `README.md` | Chạy local, deploy, cấu trúc, giới hạn tier |
| `NOTICE.md` | Credit heart gốc (Wink196, MIT) |
| `.github/workflows/pages.yml` | Deploy static lên GitHub Pages |

## Interface contracts (dùng chung cho mọi task)

```js
// glass.js — global (script type="module" không export ra window; dùng import)
LiquidGlass.attach(el: HTMLElement, opts?: {
  radius?: number;      // px; null => đọc computed border-radius
  bezel?: number;       // px, bề dày vùng cong
  scale?: number;       // âm = phóng lõm
  chroma?: number;      // px, lệch scale 3 pass
  blur?: number; saturate?: number; brightness?: number;
  tint?: string; specular?: number; shadow?: boolean;
  interactive?: boolean; tier?: 'auto'|'refract'|'blur'|'solid';
}) -> { tier: 'refract'|'blur'|'solid'; update(): void; destroy(): void }

// Tier hiện tại (đọc được từ test): document.documentElement.dataset.glassTier
// Ép tier qua query: index.html?tier=solid|blur|refract
```

```js
// script.js
window.__thg = { replay(): void, setMusic(on: boolean): void }  // để test gọi
// <audio id="bgMusic" src="./music.mp3" loop>
```

```js
// scripts/verify.mjs — CLI
node scripts/verify.mjs            # chạy tất cả check, chụp ảnh vào .tmp/shots/, exit 0 = pass
node scripts/verify.mjs --only=glass,copy   # chạy subset theo tên check
```

---

### Task 1: Bộ kiểm chứng (verify harness)

**Files:**
- Create: `package.json`
- Create: `scripts/verify.mjs`
- Modify: `.gitignore` (đã có `node_modules/`)

**Interfaces:**
- Consumes: trang đang chạy tại `http://127.0.0.1:8777/index.html` (dev server) hoặc file `file://`.
- Produces: `node scripts/verify.mjs` (exit 0/1) + ảnh `.tmp/shots/desktop-1440x900.png`, `.tmp/shots/mobile-390x844.png`; tên check cố định: `structure`, `a11y`, `glass`, `copy`, `music`, `heart`, `console`.

- [ ] **Step 1: Khởi tạo package + cài playwright-core**

```bash
cd D:/VSCode/THG
npm init -y
npm i -D playwright-core
```

Sửa `package.json`: `"type": "module"`, `"scripts": { "verify": "node scripts/verify.mjs" }`, `private: true`.

- [ ] **Step 2: Viết `scripts/verify.mjs` (khung + runner)**

Dùng `chromium.launch({ channel: 'msedge' })` (Edge đã cài, không tải browser). Runner:

```js
import { chromium } from 'playwright-core';
const BASE = process.env.THG_URL ?? 'http://127.0.0.1:8777/index.html';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([name, 'PASS']); } catch (e) { results.push([name, 'FAIL: ' + e.message]); } };
// mỗi check: page -> void, throw Error(message) khi fail
// cuối: in bảng, exit code = số check FAIL
```

Mỗi check nhận `page` và tự assert. Ảnh chụp ở viewport `1440x900` và `390x844` lưu `.tmp/shots/`.

- [ ] **Step 3: Chạy trên bản hiện tại → phải FAIL (baseline đỏ)**

```bash
node scripts/verify.mjs
```

Expected: `structure` FAIL (thiếu viewport meta, còn `.bg_heart`/`.container`), `a11y` FAIL, `glass` FAIL, `copy` FAIL, `music` FAIL; `console` FAIL vì 404 favicon + lỗi jQuery.
Ghi lại output làm baseline.

- [ ] **Step 4: Bỏ qua 404 favicon trong check `console`**

Lọc console error có URL kết thúc bằng `favicon.ico` (Task 2 sẽ thêm favicon nên filter này vô hại).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/verify.mjs .gitignore
git commit -m "test: add playwright-core verify harness for THG"
```

---

### Task 2: Cấu trúc HTML sạch + layout + tokens + dock

**Files:**
- Modify: `index.html` (viết lại toàn bộ)
- Modify: `style.css` (viết lại toàn bộ)
- Test: `scripts/verify.mjs` — check `structure`, `a11y`

**Interfaces:**
- Consumes: tokens từ Global Constraints; DOM ids cố định: `#bgMusic`, `#glass-card`, `#dock`, `#btn-music`, `#btn-replay`, `#text1`, `#bg-heart` (canvas mount), `#glass-host` (host SVG filter).
- Produces: DOM mà Task 3/6/7/8 gắn vào.

- [ ] **Step 1: Thêm assertion `structure` vào `scripts/verify.mjs`**

Assert: `document.querySelectorAll('html').length === 1`; `document.querySelectorAll('body > html, body > head, body > body').length === 0`; có `meta[name=viewport]` với `width=device-width`; không có `.bg_heart` và `.container`; có `#glass-card`, `#dock` với đúng 2 `button` (`#btn-music`, `#btn-replay`), có `#bgMusic`, có `#text1` với `textContent.length > 80` và chứa `20`; `document.title` khác `A mysterious gift for you`.

- [ ] **Step 2: Viết lại `index.html`**

Cấu trúc: `<!DOCTYPE html><html lang="vi" data-glass-tier="refract">` + `<head>` gồm charset, viewport, title (`Một ngày 20/10 dành cho bạn`), description, theme-color `#0b0812`, OG tags, favicon inline SVG data-URI (heart), `<link rel="stylesheet" href="./style.css">`. Trong `<body>`: `<canvas id="bg-heart">`, `<main class="stage">` chứa `<article id="glass-card" class="glass">` với eyebrow `20 · 10`, `<h1 id="text1" class="msg__title">` (chứa sẵn lời nhắn đầy đủ, không markup lạ), `<p class="msg__body">`, `<footer class="msg__meta">`; `<nav id="dock" class="dock">` chứa 2 `<button>` với `aria-pressed`, `aria-label`; `<audio id="bgMusic" src="./music.mp3" loop>`; `<script type="module" src="./script.js">`; `<script type="importmap">` cho three.

Lời nhắn (đúng chữ, dùng làm chuẩn cho mọi task sau):

> Chúc bạn một ngày 20/10 thật dịu dàng — nhẹ nhõm trong tâm trí, ấm áp trong lời chúc, và rạng rỡ như những điều đẹp vẫn đang đợi bạn. Chúc bạn luôn được yêu thương, luôn mạnh mẽ, và luôn là chính mình.

- [ ] **Step 3: Viết lại `style.css` — tokens + layout + typography + dock + a11y**

`:root` khai báo đúng token ở Global Constraints. `body`: nền gradient `--bg-0`→`--bg-1`, `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, `color: var(--text)`, `min-height: 100dvh`, `display:grid`, `place-items:center`, `padding: clamp(1rem, 4vw, 2rem)`, `overflow-x:hidden`.

`.glass` (chưa có hiệu ứng kính, Task 3 thêm): `max-width:560px; width:100%; padding:clamp(1.5rem,4vw,2.75rem); border-radius:var(--lg-radius); background:var(--lg-tint); border:1px solid var(--lg-border)`.

Type: `.msg__title{font-size:clamp(1.6rem,4.2vw,2.4rem); line-height:1.35; letter-spacing:-.01em; margin:0 0 1rem}`, `.msg__eyebrow{font-size:.8rem; letter-spacing:.18em; text-transform:uppercase; color:var(--accent)}`, `.msg__body{color:var(--text-dim); line-height:1.6}`, `.msg__meta{color:var(--text-dim); font-size:.9rem; margin-top:1.5rem}`.

`.dock`: `position:fixed; right:24px; bottom:24px; display:flex; gap:12px` (mobile `@media (max-width:640px)`: `left:50%; right:auto; transform:translateX(-50%); bottom:16px`). `.dock button`: 56px tròn, `border-radius:50%`, `background:var(--lg-tint)`, `border:1px solid var(--lg-border)`, `color:var(--text)`, `cursor:pointer`, `:focus-visible{outline:2px solid var(--accent); outline-offset:3px}`, `min-width:44px; min-height:44px`.

- [ ] **Step 4: Thêm assertion `a11y` vào verify**

Assert: `#btn-music` và `#btn-replay` có `aria-pressed` và `aria-label`; bấm `Tab` từ body → `document.activeElement` là một trong 2 nút sau ≤ 5 lần Tab; nút có kích thước ≥ 44×44; `getComputedStyle` của `#glass-card` có `border-radius` khác 0.

- [ ] **Step 5: Chạy verify → `structure` + `a11y` PASS**

```bash
node scripts/verify.mjs --only=structure,a11y
```

- [ ] **Step 6: Commit**

```bash
git add index.html style.css scripts/verify.mjs
git commit -m "feat: clean html structure, layout tokens, glass card and dock shell"
```

---

### Task 3: Engine Liquid Glass — SDF map + SVG filter + 3 tier

**Files:**
- Create: `glass.js`
- Create: `prototype/liquid-glass/index.html`
- Modify: `index.html` (thêm `<script type="module" src="./glass.js">`? — dùng import trong `script.js`; giữ 1 entry point `script.js`)
- Modify: `style.css` (khai báo `.glass` dùng `backdrop-filter` + rim + shadow theo tier)
- Test: `scripts/verify.mjs` — check `glass`

**Interfaces:**
- Consumes: `LiquidGlass.attach(el, opts)` theo Interface contracts; `data-glass-tier` trên `<html>`.
- Produces: tier quyết định bởi `LiquidGlass` và ghi vào `document.documentElement.dataset.glassTier`; CSS classes `.glass` + `[data-glass-tier="…"]` trên `<html>`.

- [ ] **Step 1: Thêm assertion `glass` vào verify**

Assert: `document.documentElement.dataset.glassTier` ∈ {`refract`,`blur`,`solid`}; khi tier = `refract` thì `getComputedStyle(#glass-card).backdropFilter` chứa `url(`; `backdropFilter` chứa `blur(`; tồn tại `svg filter` trong DOM với `feDisplacementMap` và `color-interpolation-filters="sRGB"`; card có `border-radius` = 32px (từ `--lg-radius`).

- [ ] **Step 2: Viết `glass.js` — phần lõi**

Cấu trúc file (mỗi phần một trách nhiệm, theo thứ tự):

1. `roundedRectSdf(x, y, halfW, halfH, r)` → khoảng cách có dấu tới biên rounded-rect.
2. `buildMap(w, h, {radius, bezel})` → canvas ≤ 512×512; với mỗi pixel: `d = sdf(...)`; `t = clamp(1 - d/bezel, 0, 1)`; vector lệch = normal hướng ra ngoài × `t`; ghi R = 128 + vx*127, G = 128 + vy*127, B = 255*t (specular mask). Trả `dataURL` (`canvas.toDataURL('image/png')`).
3. `buildFilter(id, mapUrl, {scale, chroma})` → tạo `<svg><defs><filter id color-interpolation-filters="sRGB">` gồm `feImage`(map) → 3 lần `feDisplacementMap` với `scale`, `scale*(1+chroma/100)`, `scale*(1-chroma/100)`, mỗi lần cô lập kênh bằng `feColorMatrix` (type="matrix") → `feBlend mode="screen"`.
4. `detectTier()` → `matchMedia('(prefers-reduced-transparency: reduce)').matches` → `solid`; `!CSS.supports('backdrop-filter','blur(2px)')` → `solid`; `CSS.supports('backdrop-filter','url(#x)')` → `refract`; còn lại → `blur`. URL param `?tier=` ép tier.
5. `LiquidGlass.attach(el, opts)` → dựng filter + gắn `style.backdropFilter = 'blur(Npx) saturate(180%) brightness(1.06) url(#id)'`, `style.setProperty('--lg-tint', …)`, `box-shadow` + `inset 0 1px 1px rgba(255,255,255,.5)`, `border:1px solid var(--lg-border)`; `ResizeObserver` → debounce 150ms → `update()` vẽ lại map + filter; trả `{tier, update, destroy}`.

Lưu ý bắt buộc: `color-interpolation-filters="sRGB"` (thiếu → cả khung bị dịch); `scale` âm (phóng lõm); `feImage` phải dùng data-URI (URL ngoài fail với SVG 0×0).

- [ ] **Step 3: CSS tier trong `style.css`**

```css
.glass{ backdrop-filter: blur(var(--lg-blur)) saturate(var(--lg-sat)) brightness(var(--lg-bright)); box-shadow: var(--lg-shadow), inset 0 1px 1px var(--rim-light); }
[data-glass-tier="refract"] .glass{ backdrop-filter: blur(var(--lg-blur)) saturate(var(--lg-sat)) brightness(var(--lg-bright)) var(--lg-refract); }
[data-glass-tier="blur"] .glass{ background: var(--lg-tint); }
[data-glass-tier="solid"] .glass{ background: rgba(20,14,30,.92); backdrop-filter:none; }
```

`--lg-refract` được `glass.js` set inline (`url(#glass-1)`) vì id filter sinh runtime.

- [ ] **Step 4: Tạo `prototype/liquid-glass/index.html`**

Trang cô lập: nền gradient đậm, 6 panel kính với biến thể tham số (`scale` −0.2/−0.35/−0.5, `bezel` 8/14/20, `chroma` 0/6/12), mỗi panel có nhãn tham số. Dùng **chính** `glass.js` (import tương đối `../glass.js`).

- [ ] **Step 5: Chụp ảnh prototype để so sánh tham số**

```bash
npx --yes playwright@latest screenshot --viewport-size="1280,900" --wait-for-timeout=3000 "http://127.0.0.1:8777/prototype/liquid-glass/index.html" ".tmp/shots/proto.png"
```

- [ ] **Step 6: Verify → `glass` PASS**

```bash
node scripts/verify.mjs --only=glass
```

- [ ] **Step 7: Commit**

```bash
git add glass.js style.css index.html prototype/liquid-glass/index.html scripts/verify.mjs
git commit -m "feat: liquid glass engine (SDF map, SVG displacement, 3 tiers) + param prototype"
```

---

### Task 4: Chốt tham số kính + rim hai-tone + ambient tint

**Files:**
- Modify: `style.css` (token overrides)
- Modify: `glass.js` (rim/specular theo light angle)
- Test: `scripts/verify.mjs` — check `glass`

**Interfaces:**
- Consumes: ảnh `.tmp/shots/proto.png` từ Task 3.
- Produces: bộ giá trị cuối cùng trong `:root` của `style.css`.

- [ ] **Step 1: Chọn bộ tham số từ ảnh prototype**

Tiêu chí: mép cong nhìn thấy rõ nhưng nội dung phía sau không bị méo nặng; viền màu (CA) chỉ lộ ở rìa, không loang giữa; chữ sau card vẫn đọc. Ghi lại bộ chọn vào commit message.

- [ ] **Step 2: Áp bộ tham số vào `:root`**

Cập nhật `--lg-scale`, `--lg-chroma`, `--lg-bezel` (mặc định giữ `-0.35` / `6px` / `14px` nếu ảnh không chứng minh giá trị khác tốt hơn).

- [ ] **Step 3: Rim hai-tone trong `style.css`**

Thêm vào `.glass`: `inset 0 1px 0 rgba(255,255,255,.5)` (hairline sáng trên), `inset 0 -1px 0 rgba(0,0,0,.18)` (tối dưới), `inset 1px 0 0 rgba(0,0,0,.14)` (trái), `inset -1px 0 0 rgba(0,0,0,.14)` (phải) — theo profile đo được trên Control Center.

- [ ] **Step 4: Verify lại + chụp desktop/mobile**

```bash
node scripts/verify.mjs --only=glass
```

Đọc `.tmp/shots/desktop-1440x900.png` và `.tmp/shots/mobile-390x844.png`: card phải nổi rõ trên nền particle, chữ dễ đọc.

- [ ] **Step 5: Commit**

```bash
git add style.css glass.js
git commit -m "tune: liquid glass parameters and two-tone rim"
```

---

### Task 5: Physics + specular bám con trỏ + shimmer + squircle + reduced-transparency

**Files:**
- Modify: `glass.js`
- Modify: `style.css`
- Test: `scripts/verify.mjs` — check `glass` (mở rộng), `a11y`

**Interfaces:**
- Consumes: `LiquidGlass.attach(el, {interactive:true})`.
- Produces: CSS vars `--lg-x`, `--lg-y` (0..1) và `--lg-press` (0..1) trên element; class `.is-pressed` khi đang nhấn; class `.is-shimmer` trong 700ms khi bấm.

- [ ] **Step 1: Mở rộng assertion `glass`**

Thêm: khi `?tier=refract` và hover `#btn-music` → `getComputedStyle(btn).getPropertyValue('--lg-x')` khác rỗng; click `#btn-music` → element có class `is-shimmer` ít nhất 1 lần (đo trong 200ms); `?tier=solid` → `getComputedStyle(#glass-card).backdropFilter` **không** chứa `url(` và `background-color` có alpha ≥ 0.85 (đọc `rgba()` từ computed style).

- [ ] **Step 2: Implement physics trong `glass.js`**

- `pointermove` trên element → ghi `--lg-x/--lg-y` = toạ độ tương đối (0..1) → CSS dùng cho `background: radial-gradient(... at calc(var(--lg-x)*100%) calc(var(--lg-y)*100%), ...)`.
- `pointerdown` → thêm class `is-pressed` + `--lg-press:1`; `pointerup/pointercancel/pointerleave` → bỏ class, `--lg-press:0`.
- `click` → thêm class `is-shimmer` 700ms (animation `conic-gradient` quét 360°).
- Tất cả bị tắt khi `matchMedia('(prefers-reduced-motion: reduce)').matches`.

- [ ] **Step 3: CSS cho physics + shimmer + squircle**

```css
.glass{ transform: scale(calc(1 - .035 * var(--lg-press, 0))); transition: transform .18s cubic-bezier(.34,1.56,.64,1); }
.glass.is-shimmer::after{ content:""; position:absolute; inset:0; border-radius:inherit; background:conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,.35) 40deg, transparent 80deg); animation: lg-shimmer .7s linear; pointer-events:none; }
@supports (corner-shape: squircle){ .glass{ corner-shape: squircle; } }
```

`@media (prefers-reduced-motion: reduce){ .glass{ transition:none } .glass.is-shimmer::after{ animation:none } }`

- [ ] **Step 4: Verify**

```bash
node scripts/verify.mjs --only=glass,a11y
```

- [ ] **Step 5: Commit**

```bash
git add glass.js style.css scripts/verify.mjs
git commit -m "feat: glass physics, pointer specular, shimmer, squircle, reduced-transparency tier"
```

---

### Task 6: Typewriter + replay (không phá nội dung khi JS lỗi)

**Files:**
- Modify: `script.js`
- Test: `scripts/verify.mjs` — check `copy`

**Interfaces:**
- Consumes: `#text1` (chứa sẵn lời nhắn đầy đủ trong HTML).
- Produces: `window.__thg.replay()` (xoá nội dung rồi gõ lại từ đầu); typewriter tôn trọng `prefers-reduced-motion`.

- [ ] **Step 1: Thêm assertion `copy`**

Assert: sau khi load, trong ≤ 15s `#text1` có `textContent` chứa `chính mình` và `.length >= 80`; gọi `window.__thg.replay()` → sau ≤ 15s lại chứa `chính mình`; với `reducedMotion: 'reduce'` (context mới) → sau 300ms `#text1.textContent.length >= 80` (hiện ngay, không gõ từng chữ).

- [ ] **Step 2: Implement typewriter trong `script.js`**

- Lưu `FULL_TEXT = '#text1'.textContent` ngay khi script chạy (nội dung gốc trong HTML).
- Gõ bằng `textContent` + `setTimeout`/`requestAnimationFrame` (không `innerHTML`, không `</br>`).
- Tốc độ ~35ms/ký tự như bản cũ; bỏ nhánh `|`/jQuery `$()`.
- `prefers-reduced-motion: reduce` → set nguyên text, không timer.
- `window.__thg.replay()` → reset `i=0`, xoá textContent, gõ lại.

- [ ] **Step 3: Verify**

```bash
node scripts/verify.mjs --only=copy
```

- [ ] **Step 4: Commit**

```bash
git add script.js scripts/verify.mjs
git commit -m "feat: safe typewriter with replay and reduced-motion fallback"
```

---

### Task 7: Nhạc + dock (aria-pressed, autoplay policy)

**Files:**
- Modify: `script.js`
- Test: `scripts/verify.mjs` — check `music`

**Interfaces:**
- Consumes: `<audio id="bgMusic">`, `#btn-music`.
- Produces: `window.__thg.setMusic(on: boolean)`.

- [ ] **Step 1: Thêm assertion `music`**

Assert: click `#btn-music` → `aria-pressed` đổi giá trị và `document.getElementById('bgMusic').paused === false`; click lần 2 → `paused === true`; `aria-label` đổi theo trạng thái ("Bật nhạc"/"Tắt nhạc"); `window.__thg.setMusic(false)` → `paused === true`.

- [ ] **Step 2: Implement trong `script.js`**

- Bỏ `console.clear()`; bỏ `setTimeout(…, 2000)` autoplay cũ → thử `play()` ngay, nếu bị reject thì chờ tương tác đầu tiên (click/keydown/touch) để phát; không spam listener.
- `updateMusicButton()` cập nhật `aria-pressed`, `aria-label`, `textContent` (▶/⏸ kèm `aria-hidden`).
- `window.__thg.setMusic(on)` → phát/dừng và cập nhật nút.

- [ ] **Step 3: Verify**

```bash
node scripts/verify.mjs --only=music
```

- [ ] **Step 4: Commit**

```bash
git add script.js scripts/verify.mjs
git commit -m "feat: music toggle with aria state and autoplay policy"
```

---

### Task 8: Heart Three.js hiện đại hóa + fallback + perf

**Files:**
- Modify: `script.js`
- Modify: `index.html` (importmap)
- Test: `scripts/verify.mjs` — check `heart`

**Interfaces:**
- Consumes: importmap `three` → `https://esm.sh/three@0.186.1`; `OrbitControls` → `https://esm.sh/three@0.186.1/examples/jsm/controls/OrbitControls.js`.
- Produces: `<canvas id="bg-heart">` có WebGL; fallback `#heart-fallback` (CSS radial-gradient) khi WebGL fail.

- [ ] **Step 1: Thêm assertion `heart`**

Assert: `#bg-heart` tồn tại và có kích thước > 0; WebGL context được tạo (không throw); khi ép lỗi WebGL (context init trả null → code phải fallback) → `#heart-fallback` **hiển thị** (`display !== 'none'`); không có `console.error`; `window.__thg.heartPoints` là số và ≤ 120000 (desktop) / ≤ 45000 (viewport ≤ 640px rộng).

- [ ] **Step 2: Importmap trong `index.html`**

```html
<script type="importmap">
{ "imports": {
  "three": "https://esm.sh/three@0.186.1",
  "three/addons/controls/OrbitControls.js": "https://esm.sh/three@0.186.1/examples/jsm/controls/OrbitControls.js"
} }
</script>
```

- [ ] **Step 3: Viết lại heart trong `script.js`**

- `import * as THREE from 'three'; import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`
- Renderer: `antialias:false`, `powerPreference:'high-performance'`, `setPixelRatio(Math.min(devicePixelRatio, innerWidth<640?1.5:2))`.
- Hạt: tim 120k desktop / 45k mobile; **bỏ dải hạt ngẫu nhiên ngang**; giữ `sampleHeartT()` (giảm mật độ ở trục giữa) và `heartPoint()`.
- Shader: giữ `onBeforeCompile` hiện tại nhưng bỏ `console.log(shader…)`; giữ `sizes`/`shift` attributes.
- `document.hidden` → `renderer.setAnimationLoop(null)`; `visibilitychange` → bật lại.
- `pagehide` → `renderer.dispose()`, `geometry.dispose()`, `material.dispose()`, hủy loop.
- WebGL fail (throw/không có context) → hiện `#heart-fallback` (CSS radial-gradient heart), **không** throw ra console.
- Gán `window.__thg.heartPoints = count`.

- [ ] **Step 4: Verify**

```bash
node scripts/verify.mjs --only=heart,console
```

- [ ] **Step 5: Commit**

```bash
git add index.html script.js scripts/verify.mjs
git commit -m "feat: modernize three.js heart (0.186.1, adaptive particles, pause/dispose, webgl fallback)"
```

---

### Task 9: A11y, contrast, reduced-motion, polish

**Files:**
- Modify: `style.css`, `index.html`
- Test: `scripts/verify.mjs` — check `a11y`, `console`

**Interfaces:**
- Consumes: mọi thứ từ Task 2–8.
- Produces: trang đạt checklist §8 của spec.

- [ ] **Step 1: Thêm assertion contrast vào check `a11y`**

Tính tương phản trong page: lấy `getComputedStyle` màu chữ `.msg__title` và màu nền hiệu dụng của `.glass` (nếu tier `solid`/`blur` có alpha → dùng màu nền dưới cùng `#0b0812` làm worst case), tính WCAG ratio, yêu cầu ≥ 4.5.

- [ ] **Step 2: Sửa style để đạt contrast**

Nếu thiếu: tăng `--text-dim` lên ≥ `rgba(245,242,248,.8)`, thêm `text-shadow: 0 1px 12px rgba(11,8,18,.55)` cho `.msg__title`/`.msg__body`, hoặc nâng alpha nền `.glass` ở tier `blur`/`solid`. Ưu tiên sửa token, không vá từng phần tử.

- [ ] **Step 3: Reduced-motion toàn trang**

`@media (prefers-reduced-motion: reduce)`: tắt transition/animation của `.glass`, `.dock button`; typewriter đã xử lý ở Task 6; heart dừng animation (render 1 frame tĩnh) — cờ `window.__thg.reducedMotion` để script.js dùng.

- [ ] **Step 4: Verify toàn bộ**

```bash
node scripts/verify.mjs
```

Expected: mọi check PASS, `console` không có error (favicon đã có nên bỏ filter).

- [ ] **Step 5: Chụp và soi ảnh**

```bash
node scripts/verify.mjs
```

Mở `.tmp/shots/desktop-1440x900.png` và `.tmp/shots/mobile-390x844.png`: card không tràn, chữ dễ đọc, dock không che chữ, heart không bị cắt.

- [ ] **Step 6: Commit**

```bash
git add style.css index.html script.js scripts/verify.mjs
git commit -m "fix: a11y pass (contrast, reduced-motion, focus) and visual polish"
```

---

### Task 10: Deploy GitHub Pages + tài liệu + push

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `README.md`, `NOTICE.md`
- Modify: `package.json` (thêm script `dev`)

**Interfaces:**
- Consumes: repo đã push `main`; secret/token GitHub (dùng credential manager có sẵn).
- Produces: `https://tuananh2901.github.io/THG/` trả 200.

- [ ] **Step 1: Workflow `.github/workflows/pages.yml`**

```yaml
name: pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: . }
      - id: deployment
        uses: actions/deploy-pages@v4
```

`upload-pages-artifact` với `path: .` sẽ đóng gói cả `node_modules` nếu có → thêm bước dọn trước: `run: rm -rf node_modules .tmp` trước khi upload.

- [ ] **Step 2: README.md + NOTICE.md**

README: mô tả trang, chạy local (`npx serve .` hoặc `python -m http.server`), lệnh verify (`npm i && npm run verify`), deploy, giới hạn tier (Chromium mới có refraction thật), credit.
NOTICE.md: heart gốc `Wink196` (CodePen `bGKgOYW`, MIT) — giữ `LICENSE.txt` nguyên vẹn; nêu kỹ thuật Liquid Glass tự viết dựa trên tài liệu công khai (không copy code repo khác).

- [ ] **Step 3: Push và bật Pages**

```bash
git add -A
git commit -m "ci: github pages workflow + readme and notice"
git push origin main
```

Bật Pages qua API (token lấy từ git credential manager):

```
PATCH https://api.github.com/repos/TuanAnh2901/REToolkit/THG... → repos/TuanAnh2901/THG
body: { "build_type": "workflow" }
```

Kiểm tra trạng thái: `GET /repos/TuanAnh2901/THG/pages` → `status` = `built`, `html_url` = `https://tuananh2901.github.io/THG/`.

- [ ] **Step 4: Chờ workflow chạy xong và kiểm tra link**

```bash
curl -sI https://tuananh2901.github.io/THG/ | Select-String "HTTP/"
```

Expected: `HTTP/2 200`. Mở link, kiểm tra: ảnh nền hiện, kính hiện, nút nhạc chạy.

- [ ] **Step 5: Commit trạng thái cuối + báo cáo**

Ghi lại URL, commit hash, kết quả verify trong báo cáo cuối cho người dùng.

---

## Self-review đã chạy

- **Spec coverage:** §3 copy → Task 2; §4.1 engine → Task 3–5; §4.2 tokens → Task 2/4; §4.3 heart → Task 8; §4.4 a11y → Task 7/9; §5 kiểm chứng → Task 1/3/9; §6 deploy → Task 10; §8 DoD → Task 9/10. Không có mục spec nào thiếu task.
- **Step scan:** mỗi step có 1 hành động + 1 kết quả kiểm được; không còn "TBD"; không chép nguyên code dài (thân hàm thuật toán chỉ nêu ở dạng quy tắc).
- **Type consistency:** `LiquidGlass.attach(...)` → `{tier, update, destroy}` dùng nhất quán Task 3→5; `window.__thg.replay/setMusic/heartPoints/reducedMotion` định nghĩa đúng ở Task 6/7/8; `data-glass-tier` và `dataset.glassTier` là cùng một thuộc tính (verify đọc `dataset.glassTier`, CSS đọc `[data-glass-tier]`).
- **Review Focus:** 5 dòng đều có task sở hữu test tương ứng (Task 5, Task 5, Task 7/9, Task 2/9, Task 8).
- **Proportion:** plan dài hơn spec nhưng mỗi task gắn 1 deliverable kiểm được; không có transcript của cả trang.
