<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/4337b552-fe74-4842-ba9e-3e350841d8f4

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Đóng gói Windows (.exe)

Ứng dụng desktop dùng **Electron** (cửa sổ riêng + quyền camera).

### Chuẩn bị

1. Cài dependency: `npm install`
2. Build production: `npm run build`
3. (Khuyến nghị) Build trên **máy Windows** hoặc CI Windows — tạo installer NSIS ổn định nhất.

### Lệnh đóng gói

| Lệnh | Kết quả |
|------|---------|
| `npm run dist:win` | Installer NSIS; **nhúng `.env` nếu** có `.env.build` hoặc `GEMINI_API_KEY` |
| `npm run dist:win:env` | Giống trên nhưng **bắt buộc** có API key (lỗi nếu thiếu) |
| `npm run dist:win:portable` | Bản portable `.exe` |
| `npm run dist:win:portable:env` | Portable + bắt buộc env |
| `npm run electron:dev` | Chạy thử bản Electron sau khi build |

File output ví dụ: `release/Quet CCCD Google Sheets-Setup-1.0.0.exe`

### Đóng gói kèm `.env` (API key trong installer)

**Cảnh báo:** API key nhúng trong `.exe` có thể bị trích xuất. Chỉ dùng cho bản nội bộ / phân phối tin cậy.

**Trên máy build (Windows hoặc Mac):**

```bash
cp .env.build.example .env.build
# Sửa .env.build, đặt GEMINI_API_KEY thật
npm run dist:win:env
```

Hoặc không tạo file, chỉ export biến môi trường:

```bash
export GEMINI_API_KEY="your-key"
npm run dist:win:env
```

Thứ tự ưu tiên khi chuẩn bị env: biến môi trường → `.env.build` → `.env` → `.env.local`.

**GitHub Actions:** vào repo **Settings → Secrets and variables → Actions**, thêm secret `GEMINI_API_KEY`. CI tự nhúng vào installer khi build.

### Cấu hình API key sau khi cài (không nhúng env)

Nếu build **không** có `.env` nhúng, lần chạy đầu app tạo file tại:

- Windows: `%APPDATA%\quet-cccd-google-sheets\.env`

Mở file đó, đặt `GEMINI_API_KEY=...`, rồi khởi động lại ứng dụng.

### Build từ macOS sang Windows

Cần Wine cho NSIS (`brew install wine-stable`). Nếu gặp lỗi, dùng máy Windows hoặc GitHub Actions (xem bên dưới).

## GitHub Actions (tự build `.exe`)

Workflow: [`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml)

| Sự kiện | Hành vi |
|---------|---------|
| Push lên `main` / `master` | Build installer, upload **Artifacts** (giữ 90 ngày) |
| Push tag `v*` (vd. `v1.0.0`) | Build + tạo **GitHub Release** kèm file `.exe` |
| **Actions → Build Windows → Run workflow** | Chạy build thủ công |

### Tải file sau khi CI chạy xong

1. Vào repo trên GitHub → tab **Actions** → chọn run thành công.
2. Cuối trang, mục **Artifacts** → tải `windows-installer-...` (file `.exe` bên trong).

### Phát hành bản mới bằng tag

```bash
git tag v1.0.0
git push origin v1.0.0
```

CI sẽ build và đăng file lên **Releases**.

### Thêm secret `GEMINI_API_KEY` trên GitHub

1. Repo **maxi-min/scan-cccd** → **Settings** → **Secrets and variables** → **Actions**
2. **Repository secrets** (không phải tab Environments, trừ khi bạn đã cấu hình `environment:` trong workflow)
3. **New repository secret**
   - **Name:** `GEMINI_API_KEY` (viết đúng, phân biệt hoa thường)
   - **Secret:** dán API key từ [Google AI Studio](https://aistudio.google.com/apikey)
4. **Actions** → **Build Windows** → **Run workflow** (chạy lại sau khi thêm secret)

Log thành công ở bước **Prepare bundled .env**:

```text
✓ Đã tạo build-env/app.env — sẽ được đóng gói vào file cài đặt (.exe)
```

Bước **Check repository secret** sẽ hiện `GEMINI_API_KEY đã được cấu hình (độ dài: ... ký tự)`.

**Nếu vẫn cảnh báo:** secret chưa tạo / tên sai / tạo nhầm Environment secret / PR từ fork (secret không dùng được). Build vẫn ra `.exe` nhưng không nhúng key — cấu hình `%APPDATA%\quet-cccd-google-sheets\.env` sau khi cài.
