# PHẦN MỀM AI ỨNG DỤNG – NGÂN HÀNG ĐỀ THI VÀ ĐÁP ÁN · Bản desktop

Ứng dụng desktop cho Windows, viết bằng JavaScript (Electron). Bản desktop có **đầy đủ chức năng của web app** vì dùng chính mã nguồn web app:

- **Máy chủ nội bộ** là backend Express + Prisma trong `web/server/`, chạy trong một tiến trình con của Electron và chỉ nghe `127.0.0.1`.
- **Cửa sổ ứng dụng** hiển thị giao diện React đã build trong `web/client/dist`.
- Người dùng cài bằng bộ cài `.exe`: không cần cài Node.js, không cần mở cửa sổ server hay trình duyệt.

Bản desktop không sửa mã nguồn ứng dụng web. Mọi thay đổi nghiệp vụ vẫn làm ở `web/client/` và `web/server/`, sau đó đóng gói lại.

## 1. Chức năng

Toàn bộ chức năng của web app giữ nguyên: đăng nhập, phân quyền, đổi / quên mật khẩu; ngân hàng câu hỏi (lọc, phân trang, chia sẻ theo khoa / tổ, nhập Word / Excel / CSV, xuất Word / Excel, quét câu trùng); trợ lý AI (tạo câu hỏi, soát lỗi, gợi ý chấm tự luận); tạo đề (tự động / thủ công, ma trận chủ đề × mức độ, mã đề nhiều phiên bản, ôn luyện, công bố và giao đề); làm bài, chấm điểm, kết quả; thống kê; phân tích câu hỏi; hồ sơ học tập; thẩm định và nhật ký thao tác; quản trị tài khoản.

Bổ sung riêng cho bản desktop:

| Chức năng | Cách dùng |
|---|---|
| In / Lưu PDF | Nút **In / Lưu PDF** trong *Xem trước đề* (hoặc **Ctrl+P**) → *Lưu thành PDF* (khổ A4, ẩn menu, không kèm đáp án) hoặc *In ra máy in* |
| Xuất Word / Excel | Hộp thoại **Lưu tệp** của Windows, gợi ý sẵn thư mục Downloads |
| Sao lưu dữ liệu | **Tệp → Sao lưu dữ liệu…** (Ctrl+Shift+S). Sao lưu nóng, không cần đóng phần mềm hay dừng người đang làm bài |
| Tự động sao lưu | Bật sẵn: mỗi lần thoát phần mềm tạo một bản trong thư mục `backups` và chỉ giữ lại số bản gần nhất. Tắt hoặc đổi số bản trong **Cài đặt** |
| Khôi phục dữ liệu | **Tệp → Khôi phục dữ liệu từ bản sao lưu…**. Dữ liệu hiện tại được tự sao lưu vào thư mục `backups` trước khi thay; lỗi thì tự quay lại |
| Cài đặt | **Tệp → Cài đặt…** (Ctrl+,): chế độ AI DEMO / OpenAI, khóa API, model; dùng tệp dữ liệu khác hoặc về tệp mặc định |
| Tự nâng cấp dữ liệu cũ | Mở database của phiên bản cũ: phần mềm sao lưu rồi bổ sung bảng, cột, chỉ mục còn thiếu (giống `npm run setup`), không xóa dữ liệu |
| Mở trong trình duyệt | **Công cụ → Mở giao diện trong trình duyệt** (chỉ truy cập được trên máy này) |

Phần mềm chỉ mở một cửa sổ tại một thời điểm; mở lại lối tắt sẽ đưa cửa sổ đang chạy lên trước.

## 2. Chạy thử từ mã nguồn

Yêu cầu: đã cài web app thành công (chạy **CAI-DAT-VA-CHAY.bat** một lần), Node.js 22 trở lên, Internet ở lần đầu để tải Electron.

- Mở **CHAY-DESKTOP.bat** ở thư mục gốc, hoặc:

```bash
cd desktop
npm install
npm start
```

`npm start` tự build lại web app khi mã nguồn thay đổi, tạo database mẫu rồi mở cửa sổ phần mềm.

Khi chạy từ mã nguồn, bản desktop **dùng chung** `web/server/prisma/dev.db` và cấu hình AI trong `web/server/.env` với ứng dụng web. Hạn chế ghi dữ liệu đồng thời từ cả hai bản trên cùng một tệp.

## 3. Đóng gói bộ cài Windows

- Mở **DONG-GOI-DESKTOP.bat** ở thư mục gốc, hoặc:

```bash
cd desktop
npm install
npm run dist
```

- Kết quả trong `desktop/release/`:
  - `NganHangDeThi-Setup-1.0.0.exe`: bộ cài. Cho chọn thư mục cài, tạo lối tắt Desktop và Start Menu, cài cho tài khoản Windows hiện tại, không cần quyền quản trị.
  - `win-unpacked/`: bản chạy ngay không cần cài (chép cả thư mục, mở `NganHangDeThi.exe`).
- Bộ cài **chưa ký số**, Windows SmartScreen có thể báo *Windows protected your PC* → **More info → Run anyway**. Muốn hết cảnh báo cần chứng thư ký mã (code signing certificate).
- Lần đóng gói đầu cần Internet để electron-builder tải công cụ NSIS.
- Đổi `version` trong `desktop/package.json` trước khi phát hành bản mới.

## 4. Dữ liệu

| | Bản cài đặt | Chạy từ mã nguồn |
|---|---|---|
| Tệp dữ liệu | `%APPDATA%\NganHangDeThi\data\ngan-hang-de-thi.db` | `web\server\prisma\dev.db` |
| Cấu hình | `%APPDATA%\NganHangDeThi\config.json` | `%APPDATA%\NganHangDeThi-dev\config.json` |
| Nhật ký máy chủ | `%APPDATA%\NganHangDeThi\logs\server.log` | `%APPDATA%\NganHangDeThi-dev\logs\server.log` |
| Bản sao lưu tự động | `%APPDATA%\NganHangDeThi\backups` | `%APPDATA%\NganHangDeThi-dev\backups` |

- Lần đầu mở bản cài đặt, phần mềm tạo dữ liệu mới gồm **3 tài khoản trình diễn** (`admin`, `giaovien`, `hocvien`, mật khẩu `123456`), 35 câu hỏi và 1 đề. **Đổi mật khẩu trước khi dùng thật.**
- **Chuyển dữ liệu từ bản web sang bản desktop:** tắt server web → mở bản desktop → **Tệp → Khôi phục dữ liệu từ bản sao lưu…** → chọn `web\server\prisma\dev.db`. Muốn làm việc trực tiếp trên tệp của ứng dụng web thì dùng **Cài đặt → Dùng tệp dữ liệu khác…**.
- Mỗi lần thoát phần mềm, một bản sao `tu-dong-<ngày>-<giờ>.db` được tạo trong thư mục `backups`; phần mềm giữ 7 bản gần nhất (đổi được trong **Cài đặt**) rồi xóa bản cũ hơn. Đây là bản sao cục bộ, vẫn nên định kỳ chép ra ổ đĩa hoặc USB khác.
- Khôi phục hoặc đổi tệp dữ liệu làm mọi phiên đăng nhập hết hiệu lực; người dùng đăng nhập lại.
- Gỡ cài đặt **không xóa** dữ liệu trong `%APPDATA%\NganHangDeThi`.
- Tệp sao lưu (`.db`) chứa mã băm mật khẩu và toàn bộ bài làm: cất giữ như dữ liệu nội bộ, không đưa lên kho mã.

## 5. Trợ lý AI

Mặc định là **DEMO**, chạy ngoại tuyến. Chuyển sang OpenAI trong **Tệp → Cài đặt…**: chọn *OpenAI*, nhập khóa API và model, bấm **Lưu và áp dụng**. Cài đặt có hiệu lực ngay, không cần khởi động lại phần mềm hay đăng nhập lại.

- Khóa API được mã hóa bằng tài khoản Windows đang đăng nhập (DPAPI) và không đưa vào giao diện.
- Khi chạy từ mã nguồn, giá trị mặc định lấy từ `web/server/.env`; giá trị lưu trong Cài đặt được ưu tiên.
- Chỉ đưa vào OpenAI tài liệu được phép dùng dịch vụ AI bên ngoài. Giáo viên vẫn thẩm định chuyên môn.

## 6. Bảo mật

- Máy chủ nội bộ chỉ nghe `127.0.0.1`, không mở cổng ra mạng LAN.
- Cửa sổ ứng dụng bật `contextIsolation` và `sandbox`; giao diện web chỉ được gọi duy nhất chức năng In / Lưu PDF.
- Liên kết ra ngoài mở bằng trình duyệt mặc định; trang web lạ không được tải trong cửa sổ phần mềm.
- Khóa ký phiên đăng nhập (JWT) được sinh ngẫu nhiên riêng cho mỗi máy.

## 7. Xử lý sự cố

- **Không khởi động được máy chủ nội bộ:** hộp thoại lỗi có nút *Mở nhật ký*; xem `logs\server.log`. Có thể chọn *Cài đặt dữ liệu…* để khôi phục hoặc đổi tệp dữ liệu.
- **Cổng 4317 đang bận:** phần mềm tự chọn cổng trống khác, không cần xử lý.
- **"Tệp dữ liệu không có tài khoản người dùng nào":** tệp đã chọn không đăng nhập được; phần mềm đã quay lại dữ liệu trước đó.
- **Thiếu tệp `web\server\dist\index.js` khi chạy từ mã nguồn:** chạy lại `npm start` trong thư mục `desktop` (hoặc `node scripts/prepare.mjs --dev --rebuild`).
- **Thiếu tệp chạy Electron (`electron.exe`):** `npm start` và `npm run dist` tự chạy `scripts/ensure-electron.mjs` để tải lại. Nếu Windows chặn trình giải nén của gói electron, script tải bản zip đã kiểm tra checksum và giải nén bằng `tar` có sẵn của Windows. Lỗi mạng thì kiểm tra Internet / proxy rồi chạy lại.
- **Máy chủ nội bộ dừng đột ngột:** chọn *Khởi động lại*. Câu trả lời đã tự lưu và thời gian làm bài vẫn giữ theo máy chủ.

## 8. Kiểm thử

```bash
cd desktop
npm test                # chạy cả hai bộ dưới đây
npm run test:server     # máy chủ nội bộ: API, xuất file, sao lưu nóng, dừng an toàn (không cần Electron)
npm run test:app        # ứng dụng thật: mở cửa sổ, đăng nhập, cài đặt, thoát
npm run test:packaged   # như test:app nhưng chạy bản trong release/win-unpacked
```

- Cần `npm run prepare:app` trước để có `build/app-server` và `build/template.db`.
- Kiểm thử luôn làm việc trên bản sao database trong thư mục tạm, không đụng vào dữ liệu thật. `test:app` dừng ngay nếu thư mục cấu hình (`%APPDATA%\NganHangDeThi-dev`, hoặc `NganHangDeThi` khi dùng `--packaged`) đang tồn tại; hãy đóng phần mềm và chuyển thư mục đó đi nơi khác rồi chạy lại.
- Kiểm tra nâng cấp dữ liệu của phiên bản cũ: `node scripts/test-server.mjs --db <đường dẫn database cũ>`.
- Khi có lỗi, đường dẫn thư mục kiểm thử (kèm ảnh chụp màn hình và nhật ký) được in ở cuối.

Ứng dụng web có bộ kiểm thử riêng: `cd web && npm test`.

## 9. Cấu trúc thư mục

```text
desktop/
  main.js               Tiến trình chính: cửa sổ, menu, In / PDF, lưu tệp, sao lưu / khôi phục, cài đặt
  preload.js            Cầu nối tối thiểu cho giao diện web (In / Lưu PDF)
  server-host.js        Tiến trình con: nâng cấp cấu trúc dữ liệu rồi chạy server/dist/index.js
  src/server.js         Chọn cổng, khởi động / dừng máy chủ nội bộ, chờ sẵn sàng
  src/db-sync.js        Bổ sung bảng, cột, chỉ mục cho database phiên bản cũ
  src/config.js         config.json, khóa API mã hóa, khóa ký phiên đăng nhập
  src/data.js           Kiểm tra, sao chép tệp SQLite
  src/paths.js          Đường dẫn cho bản cài đặt và bản chạy từ mã nguồn
  src/menu.js           Menu tiếng Việt
  pages/                Màn hình chờ khởi động, cửa sổ Cài đặt
  scripts/prepare.mjs   Build ứng dụng web trong ../web, tạo database mẫu + schema.json, gom máy chủ chạy kèm
  scripts/after-pack.js Chép máy chủ chạy kèm vào bản đóng gói
  scripts/make-icon.js  Tạo icon 256 px và icon.ico từ logo của ứng dụng web
  scripts/ensure-electron.mjs  Bảo đảm đã có tệp chạy Electron
  scripts/test-server.mjs      Kiểm thử máy chủ nội bộ
  scripts/test-app.mjs         Kiểm thử ứng dụng thật qua DevTools Protocol
  build/                (sinh ra) template.db, schema.json, app-server/, icon.png
  release/              (sinh ra) bộ cài và bản win-unpacked
```
