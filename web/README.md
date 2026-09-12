# NGÂN HÀNG CÂU HỎI NHẬN THỨC CHÍNH TRỊ

**Ứng dụng AI hỗ trợ xây dựng câu hỏi kiểm tra nhận thức chính trị.**

Frontend React + TypeScript + Vite + Tailwind CSS; backend Node.js + Express + TypeScript; SQLite qua Prisma ORM; JWT và bcrypt. Dữ liệu được lưu trên máy tính. Chế độ AI mặc định là DEMO, chạy không cần khóa API.

## 1. Chạy trên Windows

Cài Node.js 22 trở lên và npm. Giải nén toàn bộ gói, ví dụ vào `C:\NganHangCauHoi`. Mã nguồn ứng dụng web nằm trong thư mục `web`; các file `.bat` nằm ở thư mục gốc của gói.

- Lần đầu: mở **CAI-DAT-VA-CHAY.bat**. Script cài thư viện, khởi tạo database, tạo tài khoản mẫu, build và mở trình duyệt.
- Những lần sau: mở **CHAY-PHAN-MEM.bat**.
- Giữ cửa sổ server mở trong lúc sử dụng. Dừng bằng Ctrl+C hoặc đóng cửa sổ.
- Nếu trình duyệt không tự mở, truy cập **http://localhost:4000**.
- Lần cài đầu cần Internet để tải thư viện và Prisma engine. Sau đó chế độ DEMO hoạt động ngoại tuyến.

**Bản desktop (Windows):** dùng như một phần mềm cài trên máy, không cần mở trình duyệt hay cửa sổ server. Sau khi cài ứng dụng web, mở **CHAY-DESKTOP.bat** ở thư mục gốc để chạy thử hoặc **DONG-GOI-DESKTOP.bat** để tạo bộ cài `.exe` cho máy khác (máy cài không cần Node.js). Bản desktop dùng chính mã nguồn trong thư mục này nên đầy đủ chức năng, thêm In / Lưu PDF, sao lưu / khôi phục dữ liệu và cửa sổ cài đặt AI. Xem `../desktop/README.md`.

Hoặc chạy Terminal tại thư mục `web` (nơi chứa package.json) trên Windows/macOS/Linux:

```bash
npm install
npm run setup
npm start
```

`npm run setup` tự tạo `server/.env` với JWT secret ngẫu nhiên nếu chưa có; tạo SQLite; seed khi ngân hàng trống; build frontend và backend. Lệnh này không đặt lại mật khẩu hay xóa dữ liệu cũ.

`npm start` phục vụ cả giao diện và API tại **http://localhost:4000**. Không cần chạy Vite riêng để sử dụng bản đã build.

## 2. Tài khoản trình diễn

| Vai trò | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Quản trị viên | admin | 123456 |
| Cán bộ / Giáo viên | giaovien | 123456 |
| Học viên | hocvien | 123456 |

Admin quản lý toàn hệ thống. Giáo viên quản lý câu hỏi, đề và kết quả thuộc đề của mình. Học viên chỉ xem đề công bố được giao và kết quả cá nhân. Admin thêm, khóa/mở tài khoản, đổi mật khẩu. JWT hết hạn sau 8 giờ; khóa tài khoản có hiệu lực cả với phiên đã đăng nhập.

Dữ liệu đầu tiên: **35 câu hỏi, 5 chủ đề, 4 loại câu hỏi, 4 mức độ nhận thức, 1 đề công bố**. Câu mẫu dành cho Học viên; có thể tạo thêm câu cho đối tượng khác. Thống kê điểm ban đầu để trống cho tới khi có bài chấm xong, không tạo kết quả học viên giả.

Câu mẫu là học liệu minh họa, không phải ngân hàng chính thức đã được phê duyệt. Nguồn tài liệu ghi rõ tính chất minh họa để giáo viên thẩm định.

## 3. Sáu chức năng

### Đăng nhập và phân quyền

Nút chọn tài khoản trên trang đăng nhập điền sẵn thông tin demo. Xác thực, phân quyền tại backend; mật khẩu lưu bcrypt hash.

### Ngân hàng câu hỏi

Thêm/sửa/xóa; tìm nội dung; lọc chủ đề, mức độ, loại và đối tượng. Nhấp nội dung để xem đáp án, giải thích, nguồn. **Thêm câu tiếp theo** để nhập nhiều câu rồi **Lưu N câu hỏi**. Chọn đáp án đúng bằng radio/checkbox. Tự luận dùng giải thích làm đáp án gợi ý/hướng dẫn chấm.

**Excel / Word** xuất tập câu đang khớp bộ lọc thành `.xlsx` hoặc `.docx` thực, Unicode tiếng Việt. Excel có người tạo, ngày tạo, toàn bộ trường câu hỏi.

### Trợ lý AI xây dựng câu hỏi

Dán tài liệu (ít nhất 80 ký tự), chọn tiêu chí, tạo bản nháp, thẩm định, chỉnh sửa và lưu từng câu hoặc tất cả. Câu đã lưu được đánh dấu chống bấm lưu trùng.

**Giới hạn DEMO:** tách câu và tạo mẫu từ nội dung nhập. Cần một câu nguồn riêng dài 30–1.200 ký tự cho mỗi câu hỏi; thiếu nguồn sẽ báo thay vì lặp câu. DEMO chưa xử lý yêu cầu bổ sung, chưa đánh giá độ khó thực tế; phương án nhiễu đơn giản. Mức độ chọn là nhãn biên soạn; giáo viên cần chỉnh câu vận dụng/vận dụng cao. Đây không phải mô hình ngôn ngữ hay hệ thống kiểm duyệt chuyên môn tự động.

### Tạo đề kiểm tra

Thiết lập tên, chủ đề, đối tượng, số câu, thời gian, tỷ lệ mức độ tổng 100%, điểm đạt 0–10. Chọn tự động hoặc thủ công. Tự động làm tròn theo phần dư lớn nhất, báo mức độ thiếu câu. Chủ đề và đối tượng lọc nguồn câu hỏi.

**Chọn câu hỏi & Xem trước** hiển thị đúng tập câu sẽ lưu. **Lưu đề** tạo nháp; **Công bố đề** để học viên làm. Chỉ định học viên hoặc không chọn ai để giao cho tất cả. Mỗi học viên một lượt/đề; kiểm tra lại bằng đề mới.

Đề lưu bản chụp câu hỏi. Sửa/xóa câu ngân hàng không thay đổi đề cũ. Bài làm lưu bản chụp riêng; xáo trộn câu/đáp án cho mỗi lượt, ánh xạ lại đáp án đúng.

- **Word:** xem trước đề → Word; bản đề không chứa đáp án. API thêm `?answers=true` để xuất bản giáo viên có đáp án.
- **PDF:** xem trước đề → **In / Lưu PDF** → **Save as PDF / Lưu dưới dạng PDF** trong hộp thoại trình duyệt. A4, ẩn menu/thao tác, không có đáp án. Đây là PDF qua công cụ in của trình duyệt, không phải API tạo PDF server.

### Làm bài và chấm điểm

Đồng hồ theo thời hạn backend; tải lại không đặt lại thời gian. Câu trả lời tự lưu sau khi ngừng nhập khoảng 0,5 giây. Nếu kết nối lỗi, giao diện báo chưa lưu; cần phục hồi kết nối trong thời gian còn lại. Nộp bài chờ các yêu cầu lưu trước và gửi câu trả lời mới nhất.

API bài đang làm không gửi đáp án, giải thích hoặc trích nguồn. Hết giờ từ chối dữ liệu gửi muộn và chấm câu đã lưu. Nếu đóng trình duyệt/server, bài quá hạn chốt khi mở lại bài, kết quả hoặc thống kê; không có tiến trình ngầm khi server tắt.

Mỗi câu trọng số bằng nhau. Nhiều đáp án phải đúng toàn bộ tập, không có điểm từng phần. Tự luận chấm 0–1 điểm thành phần; tổng quy đổi thang 10. Bài có tự luận hiển thị điểm tạm tính, chưa kết luận đạt cho tới khi chấm đủ. Kết quả gồm bài làm, đáp án, giải thích và chủ đề cần ôn.

**Xuất kết quả:** trang **Kết quả kiểm tra** có nút **Xuất bảng điểm (Excel)** cho đúng phạm vi người dùng được xem — quản trị viên toàn hệ thống, giáo viên các đề của mình, học viên bài của mình. Tệp gồm sheet *Bảng điểm* (học viên, tên đăng nhập, đề, lượt làm, thời gian bắt đầu và nộp, điểm, điểm đạt, kết quả, trạng thái) và sheet *Tổng hợp theo đề* (số bài đã chấm, điểm trung bình, tỷ lệ đạt, số bài chờ chấm, số bài đang làm); trung bình và tỷ lệ đạt chỉ tính bài đã chấm xong. Mở một bài trong danh sách có nút **Tải biên bản kết quả (Word)**: thông tin học viên, điểm, kết luận và từng câu kèm bài làm, đáp án đúng, điểm thành phần, nhận xét của giáo viên. Bài đang làm dở chưa xuất được. API tương ứng: `/api/attempts?format=xlsx` (thêm `&examId=` để lọc theo đề) và `/api/attempts/:id/export`.

### Thống kê

Biểu đồ theo chủ đề, mức độ, loại, đối tượng; số đề, trung bình, tỷ lệ đạt và bài chờ chấm. Trung bình/tỷ lệ đạt chỉ tính bài chấm xong. Phân tích chủ đề tính lượt sai hoặc chưa đạt trọn điểm, kể cả tự luận. Cảnh báo **Nội dung cần tăng cường giáo dục** khi từ 40%; cần xem cùng cỡ mẫu và đánh giá thực tế.

## 4. Tích hợp OpenAI

Chỉnh **server/.env** (mẫu có sẵn tại `server/.env.example`):

```dotenv
AI_MODE=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Khởi động lại server. `server/src/ai.ts` gọi Chat Completions, yêu cầu JSON, kiểm tra cấu trúc bằng Zod, số lượng, metadata và trích đoạn nguyên văn phải nằm trong tài liệu nhập. Khóa API chỉ ở backend, không đưa vào Vite/frontend. API lỗi báo rõ, không tự chuyển DEMO. Model có thể thay theo tài khoản của bạn.

Chỉ đưa tài liệu được phép sử dụng dịch vụ AI bên ngoài vào OpenAI. DEMO không gửi tài liệu ra ngoài. Prompt yêu cầu không suy diễn hoặc tạo nội dung nhạy cảm; giáo viên vẫn thẩm định chuyên môn, không cam kết mô hình không mắc lỗi.

Tài liệu API: https://developers.openai.com/api/docs/guides/structured-outputs và https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/

## 5. Phát triển và cấu trúc

```bash
npm run dev    # API :4000, Vite :5173 có proxy /api
npm run build  # Kiểm tra TypeScript và build production
npm test       # Kiểm thử tích hợp trên database tạm riêng
npm run seed  # Tạo dữ liệu mẫu khi ngân hàng trống
```

Chạy setup trước lần phát triển đầu. Sau khi sửa mã: build trước test.

```text
client/src/main.tsx       Các trang nghiệp vụ
client/src/api.ts         API client, danh mục, kiểu câu hỏi
client/src/style.css      Responsive, in A4
server/src/index.ts       REST API, auth, phân quyền, nghiệp vụ
server/src/domain.ts      Validation, xáo trộn, chấm điểm
server/src/ai.ts          DEMO/OpenAI adapter
server/src/exports.ts     Xuất Word/Excel
server/prisma/schema.prisma  Mô hình SQLite
server/prisma/seed.ts     Dữ liệu mẫu
scripts/setup.mjs         Khởi tạo và build
scripts/integration.mjs   Kiểm thử API cô lập
```

Nhóm API: `/api/auth/login`, `/api/questions`, `/api/ai/generate`, `/api/exams`, `/api/attempts`, `/api/stats`, `/api/users`. API nghiệp vụ yêu cầu `Authorization: Bearer <JWT>`.

## 6. Sao lưu và xử lý sự cố

- SQLite tại `server/prisma/dev.db`. Tắt server rồi sao chép để sao lưu, giữ riêng `server/.env`. Khôi phục bằng cách tắt server, chép lại database.
- Không xóa database để sửa lỗi thông thường; không đưa database sử dụng thực, `.env`, API key lên kho mã.
- Mặc định lắng nghe `127.0.0.1`. Thử trên điện thoại cùng LAN: đặt `HOST=0.0.0.0`, khởi động lại, vào `http://IP-may-tinh:4000`; có thể cần cho phép cổng 4000 trong tường lửa. Giao diện/API cùng địa chỉ. Bản máy cá nhân chưa thiết lập HTTPS hoặc vận hành đa đơn vị.
- Đổi mật khẩu demo trong Quản trị trước khi dùng thật. Không có khôi phục mật khẩu email.
- **EADDRINUSE:** đóng cửa sổ server cũ hoặc đổi PORT trong .env. Frontend production dùng đường dẫn API tương đối.
- **Không mở được trang:** kiểm tra setup thành công, cửa sổ server báo địa chỉ. Kiểm tra `http://localhost:4000/api/health`.
- **Prisma chưa sẵn sàng:** chạy lại setup khi có Internet. Chạy npm install trên máy đích, không chép node_modules từ hệ điều hành khác.
- **Thiếu câu tạo đề:** đổi tỷ lệ, số câu, chủ đề, đối tượng hoặc thêm câu. Demo ban đầu dành cho Học viên.
- **Phiên hết hạn:** đăng nhập lại. Setup không phục hồi mật khẩu mặc định.

## 7. Phạm vi kiểm tra

Xem `KIEM-THU.md` để biết kết quả kiểm tra bản bàn giao. OpenAI thật chưa được gọi do chưa có API key. Chưa thử bằng trình duyệt thật hoặc máy Windows trong môi trường này; script Windows và PDF cần xác nhận trên máy sử dụng. Không khẳng định phần mềm tuyệt đối không còn lỗi.

## Cập nhật nút đăng xuất

Nút **Đăng xuất** có chữ và biểu tượng ở góc trên bên phải và cuối menu trái, dùng cho mọi vai trò. Nhấn để xóa phiên đăng nhập trên trình duyệt và quay về trang đăng nhập. Menu bên trái cho phép cuộn trên màn hình thấp.

Cập nhật bản cũ: tắt server, chép đè các file trong gói vào thư mục phần mềm đang dùng, giữ nguyên `server/.env` và `server/prisma/dev.db`, rồi mở `CHAY-PHAN-MEM.bat`. Gói không chứa hai file dữ liệu/cấu hình cá nhân này và đã có bản build mới.

## Ô nhập không bắt buộc

Trong biểu mẫu thêm/sửa câu hỏi, **Giải thích đáp án** và **Nguồn tài liệu / Trích đoạn đối chiếu** có thể để trống. Nội dung câu hỏi và các phương án/đáp án vẫn theo yêu cầu hiện hành. Không cần thay đổi database. Quy tắc này áp dụng cả lưu một câu và nhập nhiều câu thủ công. AI vẫn được yêu cầu tạo giải thích và trích nguồn khi sinh bản nháp.

## Tạo tài khoản học viên

Đăng nhập bằng tài khoản quản trị → Quản trị → **Tạo tài khoản học viên** → nhập họ tên, tên đăng nhập và mật khẩu (ít nhất 6 ký tự) → Tạo tài khoản. Vai trò Học viên được chọn sẵn và cố định trong biểu mẫu này. Tên đăng nhập gồm 3–40 chữ cái không dấu, chữ số hoặc dấu gạch dưới; không được trùng.

Tài khoản mới xuất hiện trong danh sách và đăng nhập được ngay. Học viên thấy các đề công bố giao cho tất cả hoặc đích danh mình. Quản trị viên có thể đổi mật khẩu, khóa/mở tài khoản. Nút Thêm tài khoản khác vẫn dùng để tạo vai trò khác.

## Đổi mật khẩu và quên mật khẩu

- Mọi tài khoản đã đăng nhập: nhấn **Đổi mật khẩu** trên thanh trên, nhập mật khẩu hiện tại, mật khẩu mới và xác nhận.
- Trang đăng nhập: nhấn **Quên mật khẩu?**, nhập tên đăng nhập, mã khôi phục đã lưu và mật khẩu mới. Không gửi email; phần mềm dùng mã khôi phục riêng.
- Mã khôi phục được tạo khi quản trị viên tạo tài khoản hoặc khi người dùng đổi mật khẩu. Mã chỉ hiển thị một lần, lưu riêng. Sau đổi/khôi phục mật khẩu, mã cũ và mọi phiên đăng nhập cũ hết hiệu lực.
- Tài khoản demo/tài khoản cũ chưa có mã: đăng nhập rồi đổi mật khẩu để nhận mã. Nếu quên mật khẩu trước khi có mã hoặc làm mất mã: quản trị viên đặt lại ở Quản trị. Sau đó người dùng đăng nhập và đổi mật khẩu để nhận mã mới.
- Quản trị viên đặt lại mật khẩu sẽ vô hiệu mã cũ. Không có chức năng tự đăng ký công khai; quản trị viên tạo tài khoản và chọn quyền truy cập.

**Cập nhật bản này:** tắt server, chép đè mã nguồn, giữ `server/.env` và `server/prisma/dev.db`, chạy `npm run setup` để bổ sung các cột bảo mật vào database hiện có, rồi mở `CHAY-PHAN-MEM.bat`. Nên sao lưu database trước khi cập nhật.

## Tối ưu hiệu năng

Bản này tối ưu tốc độ, không thay đổi giao diện hay API. Toàn bộ 43 kiểm thử tích hợp vẫn qua.

- **Index database:** thêm index cho `Question(creatorId)`, `Question(creatorId, audience, topic)`, `Exam(creatorId)`, `Exam(published)`, `Attempt(userId)`, `Attempt(status, expiresAt)`. Ngân hàng và danh sách đề không còn quét toàn bảng khi lọc.
- **Giảm dữ liệu đọc từ database:** `/api/attempts` và `/api/stats` trước đây kèm `include:{exam:true}`, kéo theo toàn bộ bản chụp câu hỏi của đề cho *từng* bài làm. Nay chỉ đọc các cột thực sự dùng. `/api/stats` cũng chỉ đọc 4 cột phân loại thay vì toàn bộ nội dung câu hỏi.
- **Chốt bài quá hạn theo lô:** thay vòng lặp gọi `expire()` tuần tự bằng `expireDue()` — gộp thành một giao dịch, số truy vấn không tăng theo số bài.
- **Nén gzip:** phản hồi API và tài nguyên tĩnh được nén. Danh sách câu hỏi 70,9 KB còn 10,0 KB; gói JavaScript 184,9 KB còn 57,8 KB.
- **Cache tài nguyên tĩnh:** file trong `/assets` có mã băm nội dung nên được cache 1 năm (`immutable`); `index.html` giữ `no-cache` để bản cập nhật luôn được nhận ngay.
- **Tách chunk frontend:** React và bộ biểu tượng nằm ở chunk riêng, nên khi cập nhật phần mềm trình duyệt chỉ tải lại phần mã nghiệp vụ (17 KB gzip) thay vì toàn bộ 80 KB.

**Cập nhật bản cũ:** tắt server, chép đè mã nguồn, giữ `server/.env` và `server/prisma/dev.db`, rồi chạy **CAI-DAT-VA-CHAY.bat**. Phải chạy file này (không phải `CHAY-PHAN-MEM.bat`) vì bản này thêm thư viện `compression` và cần tạo index cho database hiện có. Nên sao lưu database trước khi cập nhật.

## Các chức năng mở rộng

Bản này bổ sung 12 chức năng. Toàn bộ 101 kiểm thử tích hợp đều qua.

### Ba trang mới trên menu

- **Phân tích câu hỏi** (cán bộ, giáo viên): tính **độ khó thực tế** và **độ phân biệt** của từng câu từ bài làm thật, không dựa vào nhãn mức độ do người biên soạn tự gán. Tự cảnh báo *Quá dễ · Quá khó · Không phân biệt · Nghịch đảo · Lệch mức độ* và đề xuất mức độ nên gán lại. Dưới 8 bài đã chấm thì **không hiện độ phân biệt** vì cỡ mẫu chưa đủ tin cậy; cỡ mẫu luôn hiển thị kèm.
- **Hồ sơ học tập**: quá trình làm bài theo thời gian, điểm trung bình, tỷ lệ đạt, chủ đề và mức độ cần ôn thêm. Giáo viên chọn học viên trong phạm vi đề của mình; học viên chỉ xem được hồ sơ của chính mình.
- **Thẩm định**: hàng đợi duyệt câu hỏi, kèm **nhật ký thao tác** cho quản trị viên.

### Quy trình thẩm định câu hỏi

`Nháp → Chờ duyệt → Đã duyệt / Trả lại`, có ý kiến thẩm định gửi kèm.

> **Lưu ý quan trọng — thay đổi cách làm việc hằng ngày:**
> - Câu hỏi mới do **giáo viên** tạo ở trạng thái **Nháp**, phải được quản trị viên duyệt mới đưa vào đề được. Câu do **quản trị viên** tạo tự động Đã duyệt.
> - Giáo viên **sửa** câu đã duyệt thì câu đó **quay về Nháp** và phải duyệt lại.
> - Toàn bộ câu hỏi đã có trước khi nâng cấp đều được giữ ở trạng thái **Đã duyệt**.
> - Hệ thống chỉ có một tài khoản quản trị nên khi nhiều giáo viên cùng biên soạn, việc duyệt sẽ dồn về một người. Nếu cần, có thể bổ sung vai trò *Người thẩm định* hoặc nới lỏng thành chỉ cảnh báo.

### Ngân hàng dùng chung theo khoa / tổ bộ môn

Quản trị viên xếp mỗi tài khoản vào một khoa / tổ bộ môn trong trang **Quản trị**. Giáo viên bấm biểu tượng chia sẻ trên từng câu để đưa câu **đã duyệt** của mình cho cả tổ dùng chung. Câu dùng chung chỉ **xem và dùng ra đề**, người khác không sửa hay xóa được. Tài khoản chưa được xếp vào khoa / tổ thì chỉ thấy câu của chính mình (giữ nguyên như trước).

### Nhật ký thao tác

Ghi lại việc sửa và xóa câu hỏi, duyệt và trả lại, chia sẻ, tạo và công bố đề, chấm bài, tạo / khóa / đặt lại mật khẩu tài khoản — kèm người thực hiện và thời điểm. Chỉ quản trị viên xem được, tại cuối trang **Thẩm định**.

### Phục vụ thi trên giấy

- **Mã đề nhiều phiên bản:** trong *Xem trước đề* chọn số mã rồi bấm **Tạo mã đề**. Mỗi mã đảo thứ tự câu và phương án khác nhau, kèm **bảng đáp án** để chấm tay và nút tải riêng bản đề và bản có đáp án.
- **Ma trận chủ đề × mức độ:** khi tạo đề, thêm các dòng chủ đề kèm tỷ lệ (tổng 100%). Phần mềm chia số câu theo chủ đề trước rồi mới chia theo mức độ trong từng chủ đề.
- **Chế độ ôn luyện:** đánh dấu *Đề ôn luyện* và đặt số lượt tối đa để học viên làm lại nhiều lần. Bài ôn luyện **không tính** vào thống kê chính thức và không đưa vào phân tích chất lượng câu hỏi.

### Nhập câu hỏi từ file Word

Ngoài `.xlsx` và CSV, nay nhận thêm `.docx`. Định dạng mong đợi:

```text
Câu 1. Nội dung câu hỏi?
A. Phương án A
B. Phương án B
C. Phương án C
D. Phương án D
Đáp án: A
Giải thích: ...
Nguồn: ...
```

Câu tự luận: bỏ phần phương án và dòng Đáp án, ghi hướng dẫn chấm ở dòng `Giải thích:`. File `.doc` cũ cần mở Word lưu lại thành `.docx`.

### Phát hiện câu trùng lặp

- Khi **nhập file**, dòng nào giống từ 80% trở lên một câu đã có trong ngân hàng sẽ được cảnh báo kèm mã câu đó.
- Nút **Quét câu trùng** trong Ngân hàng câu hỏi rà toàn bộ phạm vi bạn được xem và liệt kê các cặp giống nhau, có chỉnh được ngưỡng. Cách so khớp là đối chiếu từ khóa sau khi bỏ dấu, không hiểu ngữ nghĩa nên vẫn cần người đọc lại.

### AI hỗ trợ thêm

- **Soát lỗi câu hỏi:** nút *Soát lỗi câu hỏi* trong biểu mẫu thêm / sửa. Chế độ DEMO **rà bằng quy tắc hình thức**, không phải mô hình ngôn ngữ: phương án trùng ý, phương án đúng dài hơn hẳn nên dễ đoán, từ mang tính tuyệt đối trong phương án nhiễu, thiếu giải thích hoặc nguồn, câu quá ngắn, loại câu không khớp số đáp án. Chế độ `AI_MODE=openai` sẽ hỏi mô hình.
- **Gợi ý chấm tự luận:** nút *Lấy gợi ý* cạnh ô nhập điểm. DEMO chỉ **so khớp từ khóa** với hướng dẫn chấm và nêu rõ từ khóa chưa thấy. Cả hai chế độ đều chỉ là gợi ý — **giáo viên quyết định điểm cuối cùng**.

### Hai việc kỹ thuật

- **Phân trang ngân hàng câu hỏi:** bảng câu hỏi tải theo trang 25 câu. API giữ tương thích ngược — không truyền `page` thì vẫn trả về mảng như cũ.
- **Tách `main.tsx`:** từ một file 69 KB thành `ui.tsx`, `auth.tsx`, `exam.tsx`, `bank.tsx`, `reports.tsx`, `admin.tsx` và `main.tsx` còn 4,8 KB. Các file phụ thuộc một chiều, không có import vòng.

**Cập nhật bản cũ:** tắt server, sao lưu `server/prisma/dev.db`, chép đè mã nguồn (giữ `server/.env` và `dev.db`), rồi chạy **CAI-DAT-VA-CHAY.bat**. Phải chạy file này vì bản này bổ sung cột và bảng mới cho database.

## Nhập câu hỏi từ Excel / CSV

Trong Ngân hàng câu hỏi, chọn **Nhập Excel / CSV** → chọn file → nhập chủ đề, mức độ và đối tượng mặc định → **Đọc file và xem trước** → chọn các dòng → **Lưu câu đã chọn**. Chỉ quản trị và giáo viên được nhập; câu hỏi thuộc tài khoản đang đăng nhập.

- Hỗ trợ `.xlsx` và CSV UTF-8 (dấu phẩy, chấm phẩy hoặc tab), tối đa 5 MB / 500 dòng. `.xls` cần lưu lại thành `.xlsx`. Có nút tải CSV mẫu.
- Hàng đầu là tiêu đề: `Nội dung câu hỏi`, `Phương án A`, `Phương án B`, `Phương án C`, `Phương án D`, `Đáp án`. Có thể thêm E/F. Đáp án dùng A–F, ví dụ `A, C` (CSV phải đặt trong ngoặc kép nếu có dấu phẩy).
- Các cột tùy chọn: `Loại`, `Chủ đề`, `Mức độ`, `Đối tượng`, `Giải thích`, `Nguồn`. Loại dùng SINGLE, MULTIPLE, TRUE_FALSE, SHORT; bỏ trống tự suy ra một/nhiều đáp án. Tự luận dùng SHORT, bỏ trống phương án và đáp án; hướng dẫn chấm ghi ở Giải thích.
- Hỗ trợ file xuất từ phần mềm (cột Phương án nhiều dòng) và file 200 câu đã trích xuất (cột Đáp án theo tài liệu). Chọn sheet Câu hỏi / Ngân hàng câu hỏi nếu có, nếu không dùng sheet đầu.
- Dòng lỗi không được lưu. Dòng nhiều đáp án hoặc trùng nội dung trong file cần tích chọn thủ công sau đối chiếu. Không tự loại trùng với câu hỏi đã có trong ngân hàng. Các dòng chọn được kiểm tra lại và lưu cùng một giao dịch.
- Cột Giải thích và Nguồn không bắt buộc. Không thực thi công thức Excel.

## Lớp / đơn vị học viên

Quản trị viên tạo lớp trong trang **Quản trị** (mục *Lớp / đơn vị học viên*): nhập tên rồi bấm **Thêm lớp**; đổi tên và ghi chú ngay trong bảng; chỉ xóa được lớp không còn học viên. Mỗi tài khoản học viên xếp vào một lớp bằng ô chọn ở cột **Lớp / Đơn vị** trong bảng tài khoản.

Khi tạo đề, mục **Giao cho lớp / đơn vị** cho phép giao cả tập thể; vẫn có thể giao đích danh từng học viên. Không chọn lớp và không chọn học viên nghĩa là giao cho tất cả học viên. Học viên chỉ thấy đề khi thuộc lớp được giao hoặc được chỉ định đích danh; chuyển học viên sang lớp khác thì quyền làm bài thay đổi theo.

Trang **Kết quả kiểm tra** có cột Lớp / Đơn vị và bộ lọc theo lớp; bảng điểm Excel xuất đúng phạm vi đang lọc và có thêm cột Lớp / Đơn vị. Trang **Thống kê** lọc được theo lớp để so sánh giữa các tập thể. API tương ứng: `/api/classrooms`, `/api/attempts?classroomId=`, `/api/stats?classroomId=`.

Dữ liệu cũ không bị ảnh hưởng: tài khoản chưa xếp lớp vẫn hoạt động như trước, đề đã tạo vẫn giữ nguyên cách giao. Cập nhật bản cũ cần chạy `npm run setup` để thêm bảng và cột mới.

## Chấm bài thi giấy theo mã đề

Mở đề trong **Tạo đề kiểm tra** → *Xem trước đề* → mục **Nhập bài thi giấy**: chọn học viên, chọn mã đề học viên đã làm, gõ chuỗi đáp án theo thứ tự câu rồi bấm **Chấm và lưu bài giấy**.

- Chuỗi đáp án dùng chữ cái A–F, mỗi câu một nhóm, cách nhau bằng dấu cách hoặc dấu phẩy: `A B AC D`. Nhiều đáp án viết liền (AC). Câu bỏ trống hoặc câu tự luận ghi dấu gạch `-`.
- Chọn đúng mã đề là bắt buộc khi đề đã tạo nhiều mã, vì mỗi mã đảo thứ tự câu và phương án khác nhau; phần mềm chấm theo đúng bản đề học viên cầm.
- Bài giấy được lưu như một bài làm thật: vào **Kết quả kiểm tra**, bảng điểm Excel (cột *Hình thức* ghi Thi trên giấy), **Thống kê**, **Phân tích câu hỏi** và **Hồ sơ học tập**. Nhờ vậy số liệu thi giấy không còn nằm ngoài hệ thống.
- Đề có câu tự luận thì bài ở trạng thái *Chờ chấm tự luận*; giáo viên mở bài để nhập điểm phần tự luận như bài trực tuyến.
- Chỉ cán bộ, giáo viên chủ đề hoặc quản trị viên nhập được; học viên phải có tài khoản trong phần mềm. Mỗi lần nhập tạo một lượt làm mới nên nhập nhầm thì chấm lại, bài cũ vẫn còn để đối chiếu.
- API: `POST /api/exams/:id/paper` với `{variant, entries:[{userId, answers}]}`.
