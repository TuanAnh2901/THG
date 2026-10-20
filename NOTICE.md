# NOTICE

## Trái tim hạt (heart particle scene)

Phần hiển thị trái tim bằng hạt Three.js trong `script.js` — ý tưởng, toán hình trái tim và
shader điểm — bắt nguồn từ:

- Wink196, *Heart* — https://codepen.io/Wink196/pen/bGKgOYW (MIT License)
- Bản quyền gốc được giữ nguyên trong `LICENSE.txt`.

Bản hiện tại đã viết lại cho three.js r186 (shader, hiệu năng, fallback) nhưng giữ nguyên
công thức hình trái tim và cảm giác chuyển động gốc.

## Liquid Glass

`glass.js` là mã tự viết cho repo này. Nó dùng các kỹ thuật công khai:

- Signed distance field của hình bo tròn để sinh displacement map (Canvas 2D).
- SVG filter `feImage` + `feDisplacementMap` (scale âm → phóng lõm) + `feGaussianBlur`
  + `feColorMatrix`/`feComponentTransfer`.
- `backdrop-filter` với `url(#filter)` — chỉ Chromium hỗ trợ, nên có 3 tier fallback
  (`refract` → `blur` → `solid`).

Không sao chép mã nguồn từ bất kỳ thư viện Liquid Glass nào.

## Phụ thuộc

- `three@0.186.1` — MIT License — tải qua CDN (`esm.sh`) ở thời chạy.
- `playwright-core` — Apache-2.0 — **chỉ dùng cho dev** (bộ kiểm chứng), không đóng gói vào trang.
