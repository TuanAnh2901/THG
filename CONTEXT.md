# CONTEXT — THG

Trang quà tặng tĩnh (static, 0 build step) gửi cho một bạn nữ. Bản hiện tại là dịp **20/10 (Ngày Phụ nữ Việt Nam)**.
Bản gốc (2022–2026-03) là quà 8/3, lấy từ CodePen `Wink196/pen/bGKgOYW` (MIT).

## Thuật ngữ

| Từ | Nghĩa trong repo này |
|---|---|
| **Heart** | Trường hạt Three.js ở nền, tạo hình trái tim bằng shader point sprite. Không phải ảnh. |
| **Glass card** | Panel giữa màn hình, vật liệu Liquid Glass, chứa lời nhắn 20/10. |
| **Dock** | Cụm 2 nút kính: bật/tắt nhạc + replay lời nhắn. |
| **Map** | Canvas sinh ra từ SDF rounded-rect; R/G = vector lệch, B = specular mask; nạp vào SVG filter bằng `feImage`. |
| **Bezel** | Bề dày (px) vùng cong ở viền glass. Cong tập trung trong bezel, phần giữa phẳng. |
| **Chroma / CA** | Chromatic aberration: 3 pass `feDisplacementMap` lệch scale, ghép `screen` → viền màu lệch. |
| **Tier** | Mức render của kính: `refract` (Chromium) / `blur` (Safari·FF) / `solid` (reduced-transparency hoặc thiếu `backdrop-filter`). |
| **Physics** | Phản hồi press/hover của glass: scale nhẹ + rim energize + specular bám con trỏ. |
| **Shimmer** | Vệt sáng 360° quét qua viền khi bấm. |
| **Eyebrow** | Dòng nhãn nhỏ uppercase phía trên tiêu đề (`20 · 10`). |
| **Baseline** | Screenshot trước khi sửa (`thg-before.png`) — dùng để so sánh, không commit. |

## Ràng buộc cố định

- **Static, 0 build step**: mở `index.html` là chạy. Không npm, không bundler, không webfont tải về.
- **0 dependency runtime**: kính tự viết bằng Canvas + SVG filter + CSS. Three.js là ngoại lệ duy nhất (CDN, importmap).
- **`music.mp3` giữ nguyên**, không thay nhạc, không thêm file media.
- **MIT gốc phải giữ**: `LICENSE.txt` + `NOTICE.md` ghi nguồn gốc heart shader.
- **Không copy code repo khác**: kỹ thuật Liquid Glass viết lại từ tài liệu công khai (SDF, `feDisplacementMap`, tier fallback).

## Ngoài phạm vi

- Webfont, framework, build step, backend, analytics, tracking.
- Hỗ trợ WebGL cũ; chỉ cần fallback CSS khi WebGL không khởi tạo được.
- Viết lại lịch sử git, đổi tên repo.

## Quyết định đã chốt

| # | Quyết định | Lý do | ADR |
|---|---|---|---|
| D1 | Giữ static 0 build step, không dùng npm package kính | Repo mở là chạy; dependency = rủi ro deploy + license | `docs/adr/0001-static-zero-build.md` |
| D2 | Kính tự viết: canvas SDF → SVG filter → `backdrop-filter: url()` | Refraction thật ở Chromium, 0 dep, không cạnh tranh GPU với Three.js | spec §4.1 |
| D3 | 3 tier render thay vì 1 | Safari/Firefox không có `backdrop-filter: url()`; reduced-transparency phải tôn trọng | spec §4.1 |
| D4 | Bố cục: glass card giữa, heart làm nền | Chữ phải đọc được (F1) + kính cần nội dung phía sau để bẻ cong | spec §1.1, §4.2 |
| D5 | Chỉ 2 nút điều khiển (nhạc, replay) | YAGNI; kính đẹp nhờ nền particle, không cần thêm chức năng | interview |
| D6 | Deploy qua GitHub Pages workflow, push thẳng `main` | Cần link để gửi người nhận; repo cá nhân 1 người | spec §6 |
| D7 | `three` import **động** (`await import('three')`) | CDN chết thì chỉ mất heart, typewriter + nhạc vẫn chạy | review pass |
| D8 | Heart fallback hiện mặc định, chỉ ẩn khi WebGL OK | Không JS vẫn thấy tim + đọc được lời nhắn | review pass |
