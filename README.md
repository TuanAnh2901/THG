# THG — một ngày 20/10 dành cho bạn

Trang quà tặng tĩnh: trái tim hạt Three.js, một glass card Liquid Glass và lời chúc viết tay.
Chạy thẳng bằng HTML/CSS/JS thuần — **không build step, không phụ thuộc runtime**.

- Bố cục: glass card ở giữa, trái tim làm nền, dock 2 nút (nhạc + xem lại lời nhắn).
- Vật liệu: Liquid Glass tự viết (`glass.js`) — canvas sinh displacement map từ SDF rounded-rect,
  SVG `feDisplacementMap` bẻ cong nền thật, 3 pass chromatic aberration, rim hai-tone, physics press/hover.

## Chạy local

```bash
python -m http.server 8000     # hoặc: npx serve .
# mở http://localhost:8000
```

Mở trực tiếp `index.html` bằng `file://` cũng chạy, nhưng nên dùng HTTP server để
`importmap` + ES module được xử lý đúng như trên GitHub Pages.

## Kiểm chứng

```bash
npm install            # chỉ cài playwright-core (dev)
npm run verify         # chạy 9 nhóm check, chụp ảnh vào .tmp/shots/
npm run verify -- --only=glass,contrast
```

Harness dùng Edge đã cài sẵn trên máy (`channel: 'msedge'`) nên **không** tải browser.
Check gồm: cấu trúc HTML, a11y (aria, focus, hit area), kính (3 tier, filter chain),
nội dung (typewriter + reduced-motion), nhạc (`aria-pressed`), heart (số hạt, fallback),
contrast (đo từ pixel thật), motion (reduced-motion đứng yên), console (0 error).

## Tiers của kính

| Tier | Điều kiện | Hiệu ứng |
|---|---|---|
| `refract` | Chromium hỗ trợ `backdrop-filter: url()` | Mép kính bẻ cong nền thật |
| `blur` | Safari / Firefox | Blur + tint, viền phẳng |
| `solid` | `prefers-reduced-transparency` hoặc thiếu `backdrop-filter` | Nền đục, vẫn đọc được |

Ép tier để thử: `index.html?tier=solid` (hoặc `blur`, `refract`).

## Deploy

Push vào `main` → workflow `.github/workflows/pages.yml` publish thư mục tĩnh lên
<https://tuananh2901.github.io/THG/>.

## Cấu trúc

```
index.html   cấu trúc, nội dung lời nhắn, importmap
style.css    tokens, layout, typography, 3 tier kính, dock, a11y
script.js    typewriter · nhạc · heart (Three.js)
glass.js     engine Liquid Glass
scripts/verify.mjs   bộ kiểm chứng (dev-only)
prototype/liquid-glass/index.html   bảng tham số kính để chọn giá trị
```

## Credit

- Trái tim hạt: bắt nguồn từ [CodePen `Wink196/pen/bGKgOYW`](https://codepen.io/Wink196/pen/bGKgOYW) (MIT) — xem `LICENSE.txt` và `NOTICE.md`.
- Kỹ thuật Liquid Glass: tự viết theo tài liệu công khai về `feDisplacementMap`, SDF và tier fallback; không sao chép mã từ thư viện nào.
- Font: system font stack, không tải webfont.
