# BE #01 / BE #02 — Bảo vệ dữ liệu hồ sơ trong API

## Quy tắc đã thống nhất

- Người dùng đã đăng nhập vẫn xem được hồ sơ công khai của người khác, không thêm điều kiện cùng lớp.
- Hồ sơ công khai chỉ có `_id`/`id`, `name`, `role`, `avatar`, `bio` nếu có trong dữ liệu nguồn.
- Chính chủ và admin giữ các trường trước đây nhận được, kể cả `review`, nhưng phải nằm trong allowlist.
- Không trả `password`, `scheduleRevision` hoặc trường mới chưa được cho phép, kể cả cho admin.
- Email người khác bị ẩn cả trong hồ sơ lồng nhau của lớp, yêu cầu tham gia, tài liệu, video, thông báo, bài tập, bài kiểm tra và cảnh báo. Admin vẫn được xem.
- API không tự bổ sung trường mà query/response cũ chưa trả; allowlist chỉ loại bỏ trường không được phép.

## BE #02 — Chính sách đã được xác nhận khi triển khai

- Issue GitHub #23 ban đầu yêu cầu `name`/`email`. Khi triển khai BE #02, chủ dự án xác nhận **giữ chính sách BE #01**, không mở lại quyền xem email người khác.
- Người dùng khác vẫn chỉ nhận ID, tên, vai trò, avatar, bio nếu có; không thay API contract hoặc sửa frontend để hiển thị email.
- `GET /api/users/:id` chọn bộ trường ngay ở query theo danh tính đã được middleware xác thực. Xem người khác chỉ truy vấn bộ trường công khai; chính chủ/admin dùng allowlist riêng.
- `GET /api/users/profile` tiếp tục lấy hồ sơ chính chủ bằng allowlist riêng. Query parameter `role`, `userId` hoặc `fields` không được dùng để mở rộng projection.
- DTO lọc lần nữa trước khi gửi; `phone_number`, `id_card_number`, CCCD và các tên trường mới không tự được phép, kể cả khi có trong dữ liệu cũ hoặc object mock. Trường `phone` hiện có chỉ được phép theo quy tắc chính chủ/admin.
- Bên trong `review`, chỉ cho phép `reviewedBy`, `reviewedAt`, `note`; trường mới lồng bên trong cũng không tự được đưa ra response. Nếu `reviewedBy` được populate thì tiếp tục lọc hồ sơ người duyệt theo người xem.
- Các populate có thể chứa đồng thời chính chủ/người khác vẫn dùng allowlist truy vấn hiện có và DTO lọc theo từng user. Không tuyên bố rằng toàn bộ populate đã được tối thiểu hóa theo từng người ngay ở database; giữ cách này để không làm mất dữ liệu tự xem đã cho phép ở BE #01.
- Không thêm trường CCCD vào schema, không migration dữ liệu và không sửa các query nội bộ phục vụ đăng nhập, seed hoặc xử lý nghiệp vụ.
- Nội dung issue trên GitHub cần phản ánh quyết định mới trước khi nghiệm thu; tài liệu này không có nghĩa issue đã được cập nhật hoặc đóng.

## Chức năng các phần thay đổi

- `utils/userPrivacy.js`: định nghĩa allowlist cố định; chọn trường query bằng `userQueryFields`; lọc DTO theo người xem và thông tin xét duyệt lồng nhau; giữ nguyên ID chưa populate và thời gian.
- `middleware/userPrivacy.js`: lọc response JSON trước khi gửi client; không sửa document hay dữ liệu kiểm tra quyền trong handler.
- `routes/users.js`: áp dụng allowlist cho hồ sơ chính chủ, hồ sơ theo ID và danh sách quản trị; giữ định dạng response cũ.
- Các router lớp học, nội dung và cảnh báo: áp dụng bộ lọc chung. Các populate trước đây không giới hạn trường nay chọn allowlist rõ ràng.
- `frontend/src/pages/ClassDetail.js`: chỉ hiển thị email trong yêu cầu tham gia và danh sách học sinh khi người xem là admin; giữ nguyên thao tác duyệt và thêm học sinh bằng email đã biết.
- `tests/userPrivacy.test.js`: kiểm tra quyền chính chủ/admin/người khác, projection hồ sơ, trường điện thoại/CCCD và tên biến thể, trường mới lồng trong review, tham số giả quyền và response HTTP mà không cần MongoDB thật.

## Kiểm thử

Chạy `npm test` trong `backend/`. Đây không phải thay đổi khóa JWT, thông tin admin mặc định hoặc quyền truy cập nội dung lớp; các vấn đề đó thuộc issue riêng.

Test query dùng mock để kiểm tra projection được truyền tới Mongoose; chưa thay thế kiểm thử với MongoDB thật hoặc xác minh deployment.
