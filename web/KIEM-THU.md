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

## Cập nhật 12/9/2026

- Kiểm thử tích hợp ứng dụng web: **106/106 đạt** (`cd web && npm test`), bổ sung kiểm tra xuất bảng điểm Excel (hai sheet) và biên bản kết quả Word, kèm kiểm tra phân quyền tải biên bản.
- Bản desktop có bộ kiểm thử riêng (`cd desktop && npm test`): **17 kiểm tra máy chủ nội bộ** và **25 kiểm tra ứng dụng thật** điều khiển qua DevTools Protocol. Đã chạy đạt trên cả bản chạy từ mã nguồn và bản đã đóng gói.
- Chưa kiểm thử được: các hộp thoại Windows phải bấm tay (lưu tệp khi xuất Word/Excel, In / Lưu PDF, sao lưu và khôi phục qua menu), việc chạy bộ cài để cài đặt lên máy, và chế độ OpenAI thật do chưa có khóa API.

## Cập nhật 12/9/2026 (lần 2)

Bổ sung lớp / đơn vị học viên và chấm bài thi giấy theo mã đề.

- Kiểm thử tích hợp ứng dụng web: **123/123 đạt**, thêm 10 kiểm tra về lớp / đơn vị (tạo lớp, xếp học viên, giao đề theo lớp, chặn học viên ngoài lớp, lọc bảng điểm và thống kê theo lớp) và 7 kiểm tra chấm bài thi giấy (chấm đúng theo bảng đáp án của mã đề, phân quyền, chuỗi đáp án sai định dạng, mã đề không tồn tại).
- Bản desktop: **17/17** kiểm thử máy chủ nội bộ, **25/25** kiểm thử ứng dụng thật, và **19/19** khi nâng cấp một database của phiên bản cũ — bảng Classroom cùng các cột mới được bổ sung tự động, dữ liệu cũ giữ nguyên.
