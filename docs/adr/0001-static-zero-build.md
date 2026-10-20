# ADR-0001: Giữ trang tĩnh, 0 build step — không dùng npm package Liquid Glass

- Ngày: 2026-10-20
- Trạng thái: đã chốt

## Bối cảnh

Cần nâng `THG` (trang quà tặng) lên UI/UX chuẩn với vật liệu Liquid Glass. Nhiều thư viện Liquid Glass chất lượng đang tồn tại (`@samasante/liquid-glass`, `glasskit-js`, `@tomagranate/liquid-glass`…), đều cần npm + bundler và một số bản còn kéo theo dependency (react, gsap, html2canvas).

Repo hiện tại là static site: `index.html` + `style.css` + `script.js` + `music.mp3`, mở là chạy, không có `package.json`, không có CI.

## Quyết định

Giữ static 0 build step. Tự viết engine kính bằng Canvas + SVG filter + CSS (`glass.js`), 0 dependency runtime. Three.js là ngoại lệ duy nhất (đã có sẵn, load qua CDN importmap).

## Lý do

1. **Deploy giữ nguyên** — GitHub Pages phục vụ thư mục tĩnh; không cần pipeline build, không cần Node trong CI, không rủi ro "build hỏng".
2. **Không ràng buộc license/dependency** — vài repo tham khảo có license khác nhau; tự viết tránh phải bê nguyên cả dependency tree.
3. **Không cạnh tranh GPU** — heart đang chiếm 1 WebGL context; engine kính dùng SVG filter của compositor, không tạo context thứ 2.
4. **Diff nhỏ, đọc được** — file kính ~250 dòng thay vì 1 dependency + adapter + lockfile.

## Hệ quả

- Chỉ Chromium có refraction thật → phải có tier fallback (`blur`, `solid`).
- Không dùng được feature đắt của thư viện (metaball merge, morph, scroll-edge) — chấp nhận, ngoài phạm vi.
- Nếu sau này cần feature mà tự viết không đủ, đây là điểm để đổi quyết định (mở lại ADR).
