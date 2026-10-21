# THG — Một ngày 20/10 dành cho bạn

Trang quà tặng: trái tim hạt 3D (Three.js) + lời chúc trong một panel **Liquid Glass**.
Static site thuần: **không build step, không phụ thuộc runtime** (chỉ Three.js từ CDN).

- Tim hạt + vành đai: bản gốc 8/3 (`e26e124`), **giữ nguyên** màu và chuyển động.
- Panel kính: `glass.js` — **khúc xạ theo định luật Snell** (thickness / bezel / IOR), displacement map vành bo tròn, specular map theo hướng sáng, giống hệt [demo Liquid Glass](https://liquid-glass-eta.vercel.app/).
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

- **Kính (Liquid Glass)**: `glass.js` port từ [archisvaze/liquid-glass](https://github.com/archisvaze/liquid-glass) (MIT © 2026 Archis Vaze) — khúc xạ theo định luật Snell, displacement map + specular map. Xem `NOTICE.md`.
- **Trái tim hạt 3D**: giữ nguyên bản 8/3 — [CodePen `Wink196/pen/bGKgOYW`](https://codepen.io/Wink196/pen/bGKgOYW) (MIT). Xem `LICENSE.txt`.
- Three.js r186 tải qua CDN (`esm.sh`).
