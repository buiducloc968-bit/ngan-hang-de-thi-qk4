# Kết quả kiểm tra bản bàn giao

Ngày kiểm tra: 05/09/2026. Môi trường: Linux, Node.js 24.19.0.

- Build TypeScript frontend/backend: đạt.
- Vite production: đạt; frontend được Express phục vụ cùng API.
- Khởi tạo Prisma SQLite và seed: đạt, 35 câu hỏi / 5 chủ đề, 3 tài khoản, 1 đề mẫu.
- Kiểm thử tích hợp: **36/36 đạt**, trên SQLite tạm riêng, tự dọn sau khi kiểm tra.

Các kiểm tra gồm: ba tài khoản đăng nhập; sai mật khẩu; API chưa xác thực; chặn học viên xem ngân hàng đáp án; chặn giáo viên quản trị; dữ liệu seed; thêm/sửa/tìm câu hỏi; kiểm tra đáp án hợp lệ; quyền sở hữu; DEMO AI có nguồn; tỷ lệ mức độ; báo thiếu câu; tỷ lệ sai; đề chưa công bố; không rò đáp án trước nộp; tiếp tục bài không đặt lại đồng hồ; lưu câu trả lời; chấm cả ba loại khách quan sau xáo trộn; chấm tự luận; bất biến bài sau nộp; quyền chấm; thống kê; chặn đáp án quá hạn; Excel; Word ngân hàng; Word đề; phục vụ frontend; khóa tài khoản vô hiệu hóa phiên.

Lệnh tái kiểm tra:

```bash
npm run build
npm test
```

Giới hạn: chưa có API key để gọi OpenAI thật; chưa kiểm thử trình duyệt, bản in PDF hay Windows trực tiếp. File Windows và giao diện responsive đã được triển khai nhưng cần kiểm tra trên thiết bị đích. DEMO chỉ là thuật toán mẫu, chất lượng nội dung phải được giáo viên thẩm định.

Đã kiểm tra bổ sung: tạo tài khoản học viên và đăng nhập ngay; chặn tên trùng; không lộ mã băm khôi phục; đổi mật khẩu; vô hiệu phiên cũ; từ chối mã sai; khôi phục và luân chuyển mã; không dùng lại mã cũ; đăng nhập bằng mật khẩu khôi phục.
