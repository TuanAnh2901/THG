# THG — Một ngày 20/10 dành cho bạn

Trang quà tặng: trái tim hạt 3D (Three.js) + lời chúc trong một panel **Liquid Glass**.
Static site thuần: **không build step, không phụ thuộc runtime** (chỉ Three.js từ CDN).

- Tim hạt + vành đai: bản gốc 8/3 (`e26e124`), **giữ nguyên** màu và chuyển động.
- Panel kính: `glass.js` — Canvas sinh displacement map từ SDF bo tròn → SVG `feDisplacementMap` → `backdrop-filter: url(#…)`.
- Nút nhạc: một thấu kính tròn 60px, cùng vật liệu kính.

## Chạy local

```bash
python -m http.server 5500     # hoặc: npx serve .
# mở http://localhost:5500
```

## Kiểm chứng

```bash
npm install          # chỉ playwright-core (dev)
npm run verify       # 8 nhóm check + ảnh chụp vào .tmp/shots/
```

Harness dùng Edge đã cài sẵn (`channel: 'msedge'`) nên **không** tải browser.
Check gồm: cấu trúc HTML, kính (filter chain + tier), cảnh (hạt có vẽ không, fps),
contrast (đo từ pixel thật), a11y, mobile (không tràn, không đè nhau), reduced-motion, console.

## Tương thích

| Trình duyệt | Kính |
|---|---|
| Chromium (Chrome/Edge) | mép kính **bẻ cong thật** (SVG displacement) |
| Safari / Firefox | fallback `backdrop-filter: blur()` — vẫn là kính, không cong |
| `prefers-reduced-transparency` | nền panel đục, không trong suốt |

## Deploy

Push vào `main` → workflow `.github/workflows/pages.yml` publish lên
<https://tuananh2901.github.io/THG/>.

## Credit

Trái tim hạt: [CodePen `Wink196/pen/bGKgOYW`](https://codepen.io/Wink196/pen/bGKgOYW) (MIT) — xem `LICENSE.txt`.
Kỹ thuật Liquid Glass tự viết cho repo này.
