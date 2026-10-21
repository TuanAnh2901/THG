# NOTICE

## Liquid Glass (kính)

`glass.js` — engine kính của trang này — **port** từ:

> **Liquid Glass** — https://github.com/archisvaze/liquid-glass
> Copyright (c) 2026 Archis Vaze — MIT License
> Demo: https://liquid-glass-eta.vercel.app/

Phần port: profile khúc xạ theo **định luật Snell** (`calculateRefractionProfile`), **displacement map**
vành bo tròn (`generateDisplacementMap`), **specular map** theo hướng sáng (`generateSpecularMap`) và
chuỗi SVG filter (`feGaussianBlur → feImage → feDisplacementMap → feColorMatrix → feComposite →
feComponentTransfer → feBlend`). Toàn bộ giữ nguyên MIT theo yêu cầu của tác giả.

Cảm ơn [chakachuk](https://codepen.io/chakachuk/pen/QwbaYGO) — demo CodePen đã khởi đầu cho bộ lọc
kính này (theo lời ghi của tác giả).

## Trái tim hạt (3D)

Toàn bộ phần cảnh 3D (tim hạt + vành đai) giữ nguyên từ bản 8/3 của trang, nguồn gốc:

> [CodePen `Wink196/pen/bGKgOYW`](https://codepen.io/Wink196/pen/bGKgOYW) — MIT License
> Bản quyền gốc: `LICENSE.txt`

Ba.js r186 tải qua CDN (`esm.sh`) — MIT.
