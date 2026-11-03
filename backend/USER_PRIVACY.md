# BE #01 — Bảo vệ dữ liệu hồ sơ trong API

## Quy tắc đã thống nhất

- Người dùng đã đăng nhập vẫn xem được hồ sơ công khai của người khác, không thêm điều kiện cùng lớp.
- Hồ sơ công khai chỉ có `_id`/`id`, `name`, `role`, `avatar`, `bio` nếu có trong dữ liệu nguồn.
- Chính chủ và admin giữ các trường trước đây nhận được, kể cả `review`, nhưng phải nằm trong allowlist.
- Không trả `password`, `scheduleRevision` hoặc trường mới chưa được cho phép, kể cả cho admin.
- Email người khác bị ẩn cả trong hồ sơ lồng nhau của lớp, yêu cầu tham gia, tài liệu, video, thông báo, bài tập, bài kiểm tra và cảnh báo. Admin vẫn được xem.
- API không tự bổ sung trường mà query/response cũ chưa trả; allowlist chỉ loại bỏ trường không được phép.

## Chức năng các phần thay đổi

- `utils/userPrivacy.js`: định nghĩa allowlist; lọc hồ sơ theo người xem; duyệt các tham chiếu user lồng nhau, giữ nguyên ID chưa populate và thời gian.
- `middleware/userPrivacy.js`: lọc response JSON trước khi gửi client; không sửa document hay dữ liệu kiểm tra quyền trong handler.
- `routes/users.js`: áp dụng allowlist cho hồ sơ chính chủ, hồ sơ theo ID và danh sách quản trị; giữ định dạng response cũ.
- Các router lớp học, nội dung và cảnh báo: áp dụng bộ lọc chung. Các populate trước đây không giới hạn trường nay chọn allowlist rõ ràng.
- `frontend/src/pages/ClassDetail.js`: chỉ hiển thị email trong yêu cầu tham gia và danh sách học sinh khi người xem là admin; giữ nguyên thao tác duyệt và thêm học sinh bằng email đã biết.
- `tests/userPrivacy.test.js`: kiểm tra quyền chính chủ/admin/người khác, trường mới, dữ liệu lồng nhau và response HTTP mà không cần MongoDB thật.

## Kiểm thử

Chạy `npm test` trong `backend/`. Đây không phải thay đổi khóa JWT, thông tin admin mặc định hoặc quyền truy cập nội dung lớp; các vấn đề đó thuộc issue riêng.
