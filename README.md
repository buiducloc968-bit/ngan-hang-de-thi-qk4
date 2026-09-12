# PHẦN MỀM AI ỨNG DỤNG – NGÂN HÀNG ĐỀ THI VÀ ĐÁP ÁN

Kho mã gồm hai ứng dụng dùng chung một bộ mã nghiệp vụ:

| Thư mục | Nội dung | Tài liệu |
|---|---|---|
| `web/` | Ứng dụng web: React + TypeScript + Vite, Express + Prisma/SQLite, JWT và bcrypt | [web/README.md](web/README.md) |
| `desktop/` | Ứng dụng desktop Windows (Electron), chạy chính máy chủ và giao diện của `web/` | [desktop/README.md](desktop/README.md) |

Bản desktop không có mã nghiệp vụ riêng: mọi thay đổi về câu hỏi, đề, chấm điểm hay AI đều làm trong `web/`, sau đó đóng gói lại bản desktop.

## Chạy nhanh trên Windows

| File | Việc |
|---|---|
| **CAI-DAT-VA-CHAY.bat** | Cài đặt và chạy ứng dụng web lần đầu, tự mở trình duyệt tại http://localhost:4000 |
| **CHAY-PHAN-MEM.bat** | Chạy lại ứng dụng web những lần sau |
| **CHAY-DESKTOP.bat** | Chạy ứng dụng desktop từ mã nguồn |
| **DONG-GOI-DESKTOP.bat** | Tạo bộ cài `.exe` của bản desktop, kết quả trong `desktop/release` |

Cần cài ứng dụng web (**CAI-DAT-VA-CHAY.bat**) một lần trước khi chạy hoặc đóng gói bản desktop, vì bản desktop build từ mã nguồn trong `web/`.

## Chạy bằng dòng lệnh

```bash
cd web
npm install
npm run setup
npm start
npm test         # kiểm thử tích hợp toàn bộ API
```

```bash
cd desktop
npm install
npm start        # chạy thử bản desktop
npm test         # kiểm thử máy chủ nội bộ và ứng dụng thật
npm run dist     # đóng gói bộ cài Windows
```

Yêu cầu Node.js 22 trở lên. Lần đầu cần Internet để tải thư viện, Prisma engine và Electron.

## Cấu trúc kho mã

```text
web/          Ứng dụng web (client/, server/, scripts/, prisma) — xem web/README.md
desktop/      Ứng dụng desktop Electron — xem desktop/README.md
*.bat         Các lệnh khởi chạy cho Windows
```

Phần mềm chạy hoàn toàn trên máy tính của đơn vị: ứng dụng web chạy tại `http://localhost:4000`, bản desktop chạy máy chủ nội bộ chỉ nghe `127.0.0.1`. Không có thành phần triển khai lên dịch vụ cloud.

## Dữ liệu và bảo mật

- Ứng dụng web lưu dữ liệu tại `web/server/prisma/dev.db`, cấu hình tại `web/server/.env`.
- Bản desktop đã cài đặt lưu dữ liệu tại `%APPDATA%\NganHangDeThi`; bản desktop chạy từ mã nguồn dùng chung dữ liệu với ứng dụng web.
- Không đưa database, tệp `.env` hay khóa API lên kho mã. Đổi mật khẩu các tài khoản trình diễn trước khi sử dụng thật.
