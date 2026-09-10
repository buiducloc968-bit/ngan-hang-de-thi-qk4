# Triển khai lên Render

Gói đã chuẩn bị Dockerfile, render.yaml và lệnh khởi động cloud cho Node.js + SQLite. Chưa triển khai vào tài khoản Render và chưa nhận dữ liệu thực từ máy cá nhân.

## Cấu hình

- Một Web Service Docker và persistent disk 1 GB, gắn tại /var/data.
- SQLite: file:/var/data/questions.db. Không lưu database trong container tạm thời.
- health check: /api/health. PORT=10000, HOST=0.0.0.0.
- render.yaml chọn gói starter trả phí; kiểm tra giá và chấp thuận trong Render trước khi tạo dịch vụ. Chưa có khoản phí nào được thực hiện trong quá trình chuẩn bị.
- JWT_SECRET và ba mật khẩu seed được Render sinh riêng. Lần đầu đăng nhập bằng admin và giá trị SEED_ADMIN_PASSWORD trong trang Environment của dịch vụ; tương tự giaovien/SEED_TEACHER_PASSWORD và hocvien/SEED_STUDENT_PASSWORD. Mật khẩu 123456 hiển thị ở form demo không dùng cho cloud.
- Seed giữ nguyên tài khoản đã tồn tại. Nếu nhập database cũ, mật khẩu cũ vẫn tồn tại; cần đổi mật khẩu mặc định trước khi công bố cho người khác.
- AI_MODE=demo lúc đầu. Muốn OpenAI: đặt AI_MODE=openai, OPENAI_API_KEY và OPENAI_MODEL trong phần Environment của Render. Không đưa khóa vào Git hoặc ZIP.

## Các bước triển khai sau khi kết nối tài khoản

1. Đưa mã nguồn vào kho Git được Render truy cập (không gồm .env, database, node_modules).
2. Render → New → Blueprint → chọn kho mã → xem cấu hình từ render.yaml và phí dịch vụ trước khi tạo.
3. Chờ build/deploy hoàn tất; Render cấp URL HTTPS. Kiểm tra /api/health và đăng nhập bằng tài khoản mới.
4. Thử tạo câu hỏi, tạo tài khoản, làm bài. Khởi động lại dịch vụ rồi xác nhận dữ liệu vẫn còn.

## Dữ liệu hiện có trên Windows

Không gửi server/.env vì có API key và JWT secret. Tắt phần mềm rồi sao chép server/prisma/dev.db để có bản nhất quán. File này chứa tài khoản, ngân hàng câu hỏi, đề và kết quả đã lưu.

Để chuyển dữ liệu thực, cần có bản sao database và quyền truy cập dịch vụ đích. Thực hiện khi dịch vụ dừng/ở chế độ bảo trì, sao lưu database cloud trước khi thay thế, chuyển bản sao vào /var/data/questions.db, sau đó khởi động và kiểm tra số câu hỏi, đề và kết quả. Không ghi đè database đang mở; không commit database lên Git. Chưa thực hiện bước này vì chưa có file từ máy người dùng.

Lần triển khai đầu nếu chưa chuyển database sẽ tạo 35 câu hỏi và một đề mẫu. Không nhầm dữ liệu mẫu với dữ liệu của máy cá nhân.

## Nâng cấp lên bản có 12 chức năng mở rộng

Mỗi lần khởi động, `scripts/cloud-start.mjs` chạy `prisma db push` trước khi bật server, nên các bảng và cột mới (thẩm định câu hỏi, chia sẻ theo khoa/tổ, nhật ký thao tác, mã đề, chế độ ôn luyện) được tạo tự động trên đĩa `/var/data`. Không cần thao tác thủ công và không mất dữ liệu cũ. Nên sao lưu `/var/data/questions.db` trước khi deploy bản mới.

## Kiểm chứng

Đã chuẩn bị cấu hình và script. Docker image, disk và URL Render chưa được kiểm chứng trực tiếp trước khi kết nối/triển khai. Phần mềm local vẫn chạy theo hướng dẫn cũ; biến mật khẩu seed chỉ thay đổi tài khoản khi khởi tạo mới và được cấu hình.

Tài liệu chính thức:
- https://render.com/docs/disks
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free
