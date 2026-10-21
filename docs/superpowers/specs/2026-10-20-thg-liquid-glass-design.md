# THG 20/10 — Liquid Glass redesign — design spec

- Ngày: 2026-10-20
- Repo: `TuanAnh2901/THG` (clone tại `D:\VSCode\THG`)
- Trạng thái: đã duyệt (design approved), chờ user review spec trước khi lập implementation plan

## 1. Bối cảnh

`THG` là trang quà tặng tĩnh (static site, 0 build step) gửi cho một bạn nữ nhân dịp 8/3.
Repo hiện có 4 file: `index.html`, `style.css`, `script.js`, `music.mp3` (2.4MB) + `LICENSE.txt` (MIT, gốc CodePen Wink196).

Commit cuối: 2026-03-08. Hôm nay 20/10 — trang phải được "sửa chữa" cho dịp **20/10 (Ngày Phụ nữ Việt Nam)** và nâng UI/UX lên mức "20/10": dùng vật liệu **Liquid Glass** (iOS 26) thật sự, không phải blur giả.

### 1.1 Kết quả audit hiện trạng (theo chuẩn prove-gate của improve-ui)

| # | Vấn đề | Contract | Runtime evidence | Correction |
|---|---|---|---|---|
| F1 | Chữ không đọc được | Lời nhắn phải đọc được | `.container{position:absolute;width:30%}` + `.bg_heart` không có rule → chữ dồn góc trên-trái; `cursive`; `#c7dddf` trên `#160016` ≈ 2.4:1 | Glass card giữa, system font, ≥ 4.5:1 |
| F2 | Mobile vỡ | Quà gửi qua link điện thoại | Không có `<meta name="viewport">` → layout viewport 980px, toàn trang co nhỏ | viewport + `clamp()` + dock xếp dọc |
| F3 | Không có lớp điều khiển | Cần điều khiển nhạc + xem lại lời nhắn | Nút nhạc là `<button>` phẳng `rgba(255,255,255,.2)`, không focus ring, không `aria-pressed`, nhãn `cursive` 20px | Dock 2 nút kính, `aria-pressed`, focus ring, hit area ≥ 44px |

Không phát sinh finding nào khác đạt cả 3 bằng chứng (contract + runtime + correction); các điểm còn lại (perf, WebGL, code smell) là **behavioral**, thuộc implementation scope chứ không phải design finding.

## 2. Mục tiêu & phạm vi

**Mục tiêu:** trang quà 20/10 đẹp, chạy mượt trên desktop lẫn mobile, có vật liệu Liquid Glass đúng chất, đọc dễ, dùng được với bàn phím và screen reader.

**Trong phạm vi**
1. Sửa cấu trúc HTML (một `<html>`, viewport, meta, title, OG).
2. Glass card giữa màn hình + dock 2 nút kính.
3. Engine Liquid Glass tự viết, vanilla, 0 dependency, 0 build step.
4. Viết lại lời nhắn 20/10.
5. Hiện đại hóa Three.js heart (version, perf, fallback, dispose).
6. A11y: reduced-motion / reduced-transparency, focus, aria, contrast.
7. GitHub Pages workflow + bật Pages.

**Ngoài phạm vi**
- Không thêm webfont, không thêm file nhạc mới, không thêm framework/build step.
- Không rewrite lịch sử git, không đổi tên repo, không xóa `music.mp3`.
- Không thêm chữ ký/tên người gửi cụ thể (dùng `<!-- SIGN-OFF -->` placeholder).
- Không hỗ trợ WebGL cũ (< WebGL1) — chỉ fallback CSS khi WebGL không khởi tạo được.

## 3. Nội dung (lời nhắn 20/10)

Copy do mình viết, user sửa trực tiếp trong `index.html` (không hard-code trong JS):

```html
<p class="msg__eyebrow">20 · 10</p>
<h1 class="msg__title" id="text1">Chúc bạn một ngày 20/10 thật dịu dàng — nhẹ nhõm trong tâm trí, ấm áp trong lời chúc, và rạng rỡ như những điều đẹp vẫn đang đợi bạn. Chúc bạn luôn được yêu thương, luôn mạnh mẽ, và luôn là chính mình.</h1>
<p class="msg__body">Một chút kính, một chút ánh sáng, và cả trái tim này — dành cho ngày của bạn.</p>
<footer class="msg__meta">
  <span>20 tháng 10</span>
  <!-- SIGN-OFF -->
</footer>
```

- Typewriter chạy trên `#text1` (nội dung có sẵn trong HTML → nếu JS chết, chữ vẫn đọc được).
- Copy trong HTML phải là **text thuần**; dấu `<` `>` không dùng để chèn markup. Xuống dòng dùng `<br>` thật trong markup, không phải `</br>`.
- Nếu `prefers-reduced-motion: reduce` → hiện nguyên văn, không gõ từng chữ.

## 4. Kiến trúc

```
index.html      cấu trúc sạch, nội dung có sẵn trong HTML, meta, OG, svg filter host
style.css       tokens, layout, typography, glass CSS (fallback tiers), a11y
script.js       heart (Three.js) · typewriter · music · dock
glass.js        engine LiquidGlass: SDF canvas → SVG filter → backdrop-filter
NOTICE.md       credit heart gốc (Wink196, MIT) + credit kỹ thuật Liquid Glass
README.md       chạy local, deploy, cấu trúc
.github/workflows/pages.yml   GitHub Pages
prototype/liquid-glass/index.html   chốt tham số kính (nhánh prototype/liquid-glass)
```

**Ràng buộc:** mở `index.html` bằng file:// hoặc http server đều chạy; không có `npm install`; không có file nào ngoài 4 file gốc bị xóa.

### 4.1 Engine Liquid Glass (`glass.js`)

API:

```js
const handle = LiquidGlass.attach(el, {
  radius: 32,        // px, đọc từ border-radius nếu null
  bezel: 14,         // px, bề dày vùng cong
  scale: -0.35,      // âm = phóng lõm (Apple look)
  chroma: 6,         // px, lệch scale 3 pass = chromatic aberration
  blur: 2, saturate: 1.8, brightness: 1.06,
  tint: 'rgba(255,255,255,.06)',
  specular: .6, shadow: true, interactive: true, tier: 'auto'
});
// -> { tier, update(), destroy() }
```

Cơ chế (theo kỹ thuật đã đọc từ `sohumsuthar/liquid-glass`, `deepika-builds/liquid-glass`, `nikdelvin/liquid-glass`):

1. **Displacement map** — canvas ≤ 512², sinh từ **SDF rounded-rect**: R = lệch X, G = lệch Y, 128 = trung tính, B = specular mask. Bề dày bezel tính theo px thật, không phụ thuộc tỉ lệ phần tử.
2. **SVG filter** (mỗi element 1 filter, `color-interpolation-filters="sRGB"` — bắt buộc, nếu không cả khung bị lệch):
   `feImage(dataURI map)` → `feDisplacementMap(in=SourceGraphic, in2=map, scale, xChannelSelector=R, yChannelSelector=G)` → 3 pass lệch scale (`scale·(1±chroma/100)`) cô lập từng kênh bằng `feColorMatrix` → `feBlend mode=screen` để ghép lại.
3. **CSS áp dụng**: `backdrop-filter: blur(2px) saturate(180%) brightness(1.06) url(#glass-N)`, kèm
   `border: 1px solid rgba(255,255,255,.13)`, `box-shadow: 0 24px 60px rgba(0,0,0,.45), inset 0 1px 1px rgba(255,255,255,.5)`.
4. **Tier** — set `data-glass-tier` trên `<html>`:
   - `refract`: hỗ trợ `backdrop-filter: url()` (Chromium) → cong thật.
   - `blur`: Safari/Firefox → chỉ blur + rim.
   - `solid`: `prefers-reduced-transparency: reduce` hoặc thiếu `backdrop-filter` → nền đục, vẫn giữ hình dạng + shadow.
5. **Đầy đủ thuộc tính**: specular hai-tone (hairline sáng trên+dưới, tối trái+phải), **physics** (press → `scale(.965)` + rim energize; hover → specular bám con trỏ qua CSS var `--lg-x/--lg-y`), **shimmer** 360° quét khi bấm, `corner-shape: squircle` (Chrome 139+, progressive), ambient tint, glow viền trong.
6. **Perf**: map sinh 1 lần / element, regenerate khi resize (ResizeObserver + debounce 150ms); hover/press chỉ set CSS var → **không** JS per-frame; không tạo thêm WebGL context. Specular bám con trỏ hiện bằng `background-image: radial-gradient(... at calc(var(--lg-x)*100%) ...)` trên chính element, nên không tốn thêm lớp DOM.
7. **Chromatic aberration là tuỳ chọn** (`?ca=1`): 3 pass `feDisplacementMap` trên nền đang chạy tốn **~3× frame time** (đo: 47 fps vs 139 fps). Mặc định 1 pass + viền sắc màu giả bằng `inset` box-shadow (rẻ, không tốn GPU).

### 4.2 Tokens (`style.css`)

```css
--bg-0:#0b0812; --bg-1:#150d20;
--accent:#ff7ab6; --accent-2:#8b5cf6;
--text:#f5f2f8; --text-dim:rgba(245,242,248,.72);
--lg-blur:2px; --lg-sat:180%; --lg-bright:1.06; --lg-scale:-0.35; --lg-chroma:6px;
--lg-radius:32px; --lg-bezel:14px; --lg-tint:rgba(255,255,255,.06);
--lg-border:rgba(255,255,255,.13); --lg-shadow:0 24px 60px rgba(0,0,0,.45);
--rim-light:rgba(255,255,255,.5); --rim-dark:rgba(0,0,0,.18);
```

Type: `system-ui` stack (bỏ `cursive`); h1 `clamp(1.6rem,4.2vw,2.4rem)` / 1.35 / `-0.01em`; body `1rem`/1.6; eyebrow `.8rem` uppercase tracking `.18em`.

Layout: `body` grid 1 cột, card `max-width:560px`, `margin:auto`, `padding:clamp(1.5rem,4vw,2.75rem)`, `radius:32px`. Dock: desktop góc phải dưới (24px), mobile đáy giữa; nút 56px tròn, hit area ≥ 44px.

**Bố cục cuối (sau feedback):** bảng chúc mừng **không được ở giữa** — nó là một panel nhỏ nằm 1 góc (desktop: góc trên-trái 24px, rộng ≤ 380px; mobile: trên, full width trừ 12px mỗi bên; landscape: góc trên-trái + dock nhảy lên góc trên-phải). Cảnh 3D là nhân vật chính, card chỉ là overlay nhỏ có thể đọc. Hệ particle (tim + vành) được dời sang phải trên desktop để không bị card che.

### 4.3 Heart + belt (Three.js) — dựa trên bản 8/3

Cảnh là **một hệ 3D**: trái tim hạt ở giữa, quanh nó là **vành đai hạt** (như vành hành tinh), cả nhóm xoay chậm quanh trục Y như một hành tinh. Tim + vành nằm trong **cùng một đám hạt** (đúng bản 8/3) nên cả khối xoay như một vật thể. Kéo chuột để orbit, lăn chuột để zoom (bản 8/3 có zoom, đã bật lại).

**Số liệu (đã đo, không đoán):**

| | Bản 8/3 | Bản hiện tại | Ghi chú |
|---|---|---|---|
| Hạt tim | 200.000 | 200.000 (mobile 60k) | giữ nguyên bản gốc |
| Hạt vành | 100.000 (bán kính 10→40, `rand^1.5` dồn vào trong) | 100.000 (mobile 30k) | **phân bố stratified**: bán kính + góc đều, lỗ tròn sạch, không vón cục |
| Camera | `(0, 4, 21)`, FOV 60 | `(0, 4, 21)`, FOV 60 (mobile lùi 34) | giữ nguyên khung hình gốc |
| Controls | damping, không pan, **có zoom** | damping, không pan, **có zoom** (12–120) | bản mình tắt nhầm → đã bật lại |
| Xoay cả khối | `rotation.y = t*0.05` | `rotation.y = t*0.05` | giữ tốc độ gốc |
| Nhịp hạt | `time = t*PI` | `time = t*PI*2` | ×2 để vũ trụ nhảy thấy được |
| Màu | vàng→tím theo bán kính | vàng→tím theo bán kính **+ quét bất đối xứng theo X** | tim đối xứng trục Y nên xoay không thấy; quét màu làm cái xoay đọc được |
| DPR | không set (= 1) | cap 1.25 (mobile 1) | |

**Palette (đo trên ảnh thật, không mắt thường):** additive blending **cộng dồn các kênh màu** → một màu có cả 3 kênh sẽ cháy thành trắng khi chồng nhiều lớp. Quy tắc: **mỗi màu có một kênh = 0** → vàng `(1.0, 0.72, 0.0)`, tím `(0.14, 0.05, 1.0)`; ranh giới vàng/tím dùng `smoothstep` sắc (không dải trộn trung gian). Nền CSS cũng phải tối (radial gradient `.34 → .16`) vì hạt cộng thêm lên nền sáng sẽ loãng màu. Đo trước/sau: màu sáng trong tim trước là `(136,108,114)` xám hồng, sau là `(162,138,19)` vàng thật; **pixel trắng trong cảnh: 7.6% → 0.1%**.

**Chuyển động phải thấy được** (đã sửa sau phản hồi: mọi chuyển động trước đó đều là *no-op* về mặt thị giác):

| Chuyển động | Vì sao trước đó không thấy | Cách sửa |
|---|---|---|
| Xoay cả hệ | Tim đối xứng trục Y, xoay Y không đổi hình (đo: 1.9/255) | Gradient màu bất đối xứng theo trục X → cái xoay đọc được |
| Vành tự quay | Vành tròn **đều** → quay không đổi hình (đo: 1.3/255) | Bỏ sóng/lobe (yêu cầu "vành tròn cách đều"), thay bằng gradient màu |
| Hạt rung | `shift.z*t` chạy 0.05–0.49 rad/s → chu kỳ 13–125s | Nhân thời gian shader ×2 |
| Camera tự quay | Bật thì cảnh nghiêng, vành đai thành đường chéo | **Tắt** — camera đứng yên, hành tinh tự xoay |

- Pin `three@0.186.1` qua importmap + esm CDN (bỏ `cdn.skypack.dev` 0.136).
- **Import động** (`await import('three')`): CDN chết thì chỉ mất heart, typewriter + nhạc + dock vẫn chạy; fallback CSS heart hiện sẵn.
- **Bảng chúc mừng không được làm "lồng" (cage)**: `.glass { pointer-events: none }` → kéo trên card vẫn xoay cảnh; specular bám con trỏ lấy từ `pointermove` toàn cục.
- **Reduce Motion = không có chuyển động tự động, KHÔNG phải đóng băng**: canvas phải vẽ lại khi người dùng kéo/zoom (`controls` event → render). Bản cũ render đúng 1 frame rồi dừng → kéo cũng không thấy gì.
- Pause render khi `document.hidden`; `dispose()` khi `pagehide` (trừ `event.persisted`).
- WebGL fail → fallback: CSS radial-gradient heart + nội dung vẫn hiện.

### 4.4 A11y & motion

- `prefers-reduced-motion: reduce` → hiện full text, particle đứng yên (render 1 frame), tắt physics/shimmer.
- `prefers-reduced-transparency: reduce` → tier `solid`.
- Nút: `aria-pressed` (nút nhạc — toggle), `aria-label` đổi theo trạng thái, `:focus-visible` ring 2px, hit area ≥ 44px. Nút "xem lại" là action (không `aria-pressed`).
- Text trong card ≥ 4.5:1 — đo bằng **pixel thật** (screenshot → canvas trong browser): hiện ~10.4:1 cho tiêu đề, ~6.2:1 cho phụ. Card dùng lớp overlay tối gradient (`::before`) thay cho yêu cầu blur ≥ 12px, vì blur kính chỉ 2px.
- Trang đọc được khi JS lỗi: nội dung nằm sẵn trong HTML.

## 5. Kiểm chứng

1. **Prototype** (nhánh `prototype/liquid-glass`): `prototype/liquid-glass/index.html` — grid tham số kính trên nền ảnh gradient, chụp màn hình, chốt `scale/bezel/chroma/blur/saturate`.
2. **Sau tích hợp**: screenshot loop Playwright (Chromium) — 1440×900 + 390×844, so sánh trước/sau (`thg-before.png` là baseline).
3. **Console**: 0 error, 0 warning.
4. **A11y kiểm bằng mắt + script**: tab order, focus ring, `aria-pressed` đổi đúng, text contrast.
5. **Tier**: ép `data-glass-tier="blur"` / `"solid"` để xác nhận fallback trông đẹp.
6. **Deploy**: workflow Pages chạy xanh, `https://tuananh2901.github.io/THG/` trả 200, tải asset qua link.

## 6. Deploy

- `.github/workflows/pages.yml`: `actions/configure-pages` → `actions/upload-pages-artifact` (path: `.`) → `actions/deploy-pages`. Không build step, artifact = source tĩnh.
- Bật Pages cho repo qua GitHub API (`build_type: workflow`, branch `main`) sau khi push workflow.
- Push thẳng `main` (repo này là repo cá nhân 1 người dùng, không cần PR).

## 7. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Refraction thật chỉ Chromium | 3 tier; `blur` vẫn đẹp; `solid` vẫn đọc được |
| Filter `url()` trong `backdrop-filter` tăng GPU | Chỉ 3 phần tử kính; map 512²; không JS per-frame |
| Không thấy được hiệu ứng nếu chạy `file://` (CSP/mixed content) | Test qua http server + Pages; ghi rõ trong README |
| Bản quyền | Giữ `LICENSE.txt` (MIT Wink196) + `NOTICE.md` ghi rõ nguồn gốc heart shader; kỹ thuật Liquid Glass viết lại từ tài liệu công khai, không copy code repo khác |
| `music.mp3` 2.4MB + Three.js CDN | Chấp nhận; Pages phục vụ qua CDN của GitHub |

## 8. Định nghĩa xong (definition of done)

- [ ] `index.html` hợp lệ, 1 `<html>`, có viewport, không JS lỗi
- [ ] Lời nhắn 20/10 hiển thị đúng, typewriter chạy, replay hoạt động
- [ ] Glass card + 2 nút kính: refraction (Chromium), blur (Safari/FF), solid khi reduced-transparency
- [ ] Dock: `aria-pressed` đúng, focus ring, 44px hit area
- [ ] Heart chạy mượt, pause khi ẩn tab, fallback khi mất WebGL
- [ ] Reduced-motion: full text ngay, không animation
- [ ] Contrast text ≥ 4.5:1
- [ ] Screenshot desktop + mobile đẹp, so sánh được với baseline
- [ ] Workflow Pages chạy xanh, link live trả 200
- [ ] `README.md` + `NOTICE.md` đầy đủ
- [ ] Push `main`, Pages bật
