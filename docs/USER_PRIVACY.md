# Hồ sơ và mật khẩu

## 1. Dữ liệu theo người xem

| Người xem đã xác thực | Dữ liệu được phép |
|---|---|
| Người khác | `_id`/`id`, `name`, `role`, `avatar`, `bio` nếu nguồn có |
| Chính chủ/admin | Các trường riêng tư đã có trong allowlist, gồm `phone` và metadata xét duyệt |

- Không yêu cầu cùng lớp để xem hồ sơ công khai. Email người khác bị ẩn cả trong hồ sơ lồng của lớp, yêu cầu tham gia, học liệu, bài nộp và cảnh báo; admin vẫn xem được.
- Không trả `password`, `scheduleRevision` hoặc trường mới chưa được cho phép, kể cả cho admin. Allowlist chỉ lọc, không tự bổ sung trường nguồn/query cũ không trả.
- DTO không nhận các tên biến thể `phone_number`, `id_card_number`, CCCD hoặc trường mới chỉ vì chúng xuất hiện trong dữ liệu legacy/mock.
- `review` chỉ có `reviewedBy`, `reviewedAt`, `note`; hồ sơ người duyệt khi populate tiếp tục lọc theo người xem.

## 2. Quyết định BE #02 và cách áp dụng

[Issue #23](https://github.com/ThanhVu6102/tutoring-platform/issues/23) ban đầu đề cập name/email, nhưng chủ dự án xác nhận **giữ chính sách BE #01**, không mở lại email người khác hoặc sửa UI để hiển thị email đó.

- `GET /api/users/:id` chọn trường ngay ở query theo danh tính đã xác thực; `/api/users/profile` dùng allowlist chính chủ. Query `role`, `userId`, `fields` không mở rộng quyền/projection.
- DTO lọc lại trước khi gửi. Populate có nhiều người giữ query allowlist chung và lọc từng user, tránh mất dữ liệu chính chủ được phép xem; không tuyên bố mọi populate đã tối thiểu hóa riêng cho từng người ở DB.
- Không thêm CCCD vào schema, migration dữ liệu hoặc sửa query nội bộ phục vụ đăng nhập/seed/nghiệp vụ.

## 3. Vị trí triển khai và kiểm thử

Quyền riêng tư **nội dung bài nộp bài tập** (file/điểm/nhận xét), khác với hồ sơ user lồng nhau, được mô tả ở [BE #08](BACKEND_SECURITY.md). Học sinh chỉ nhận bài nộp chính chủ; danh sách chỉ có metadata.

| File | Vai trò |
|---|---|
| `backend/utils/userPrivacy.js` | Allowlist, `userQueryFields`, DTO theo người xem; giữ ID chưa populate và thời gian |
| `backend/middleware/userPrivacy.js` | Lọc JSON response, không sửa document/kiểm tra quyền trong handler |
| `backend/routes/users.js` và router lớp/học liệu/cảnh báo | Áp dụng query fields và bộ lọc chung, giữ dạng response |
| `frontend/src/pages/ClassDetail.js` | Chỉ admin thấy email roster/yêu cầu tham gia; giữ thao tác thêm bằng email đã biết |
| `backend/tests/userPrivacy.test.js` | Mock projection + HTTP: chính chủ/admin/người khác, review lồng, trường mới và giả quyền |

Chạy `npm test --prefix backend`. Test mock không thay kiểm thử MongoDB/deployment; phần này không thay khóa JWT, cấu hình admin mặc định hoặc quyền truy cập nội dung lớp.

<a id="doi-mat-khau"></a>
## 4. Đổi mật khẩu chính chủ — issue #41

`PATCH /api/users/password` yêu cầu Bearer token và tài khoản hoạt động:

```json
{ "currentPassword": "<mật khẩu hiện tại>", "newPassword": "<mật khẩu mới>" }
```

- Chỉ chọn tài khoản bằng ID trong phiên. Mật khẩu hiện tại không rỗng, tối đa 72 byte UTF-8; mật khẩu mới ít nhất 8 ký tự, tối đa 72 byte và khác mật khẩu cũ. Không cắt khoảng trắng.
- Kiểm tra bcrypt, băm mới với hệ số 10; ghi có điều kiện theo giá trị băm cũ và trạng thái tài khoản, tránh ghi đè khi cạnh tranh hoặc sau khi bị chặn. Không tự đổi mật khẩu tài khoản hiện có hay di chuyển dữ liệu.
- `200 {message}` không trả mật khẩu/giá trị băm/token; `400` dữ liệu hoặc mật khẩu hiện tại sai, `401` thiếu phiên, `403`/`423` không đủ điều kiện, `409` cạnh tranh, `500` lỗi chung không lộ dữ liệu bí mật.
- Mọi tài khoản đang hoạt động, **kể cả quản trị viên**, được đổi mật khẩu chính chủ sau khi xác minh mật khẩu hiện tại. Đăng nhập chỉ đối chiếu giá trị băm trong DB; mật khẩu mặc định/cấu hình không được ghi đè mật khẩu mới, tự khôi phục tài khoản hay nâng quyền. Biến `ADMIN_*` chỉ phục vụ tạo tài khoản ban đầu bằng thao tác thủ công, không reset tài khoản đã tồn tại.
- JWT cũ **còn hiệu lực đến khi hết hạn**; chưa thu hồi phiên/reset qua email. Cho phép đổi mật khẩu không đồng nghĩa đã có cơ chế kết thúc mọi phiên cũ; thay đổi cơ chế JWT cần xử lý riêng.
- Biểu mẫu hồ sơ có mật khẩu hiện tại/mới/nhập lại, kiểm tra khớp và giới hạn UTF-8, chặn gửi lặp, báo kết quả, xóa ba ô khi thành công. Không lưu mật khẩu trong localStorage/sessionStorage hoặc gửi cùng cập nhật hồ sơ; không thêm thư viện.
- Kiểm thử: `backend/tests/changePassword.test.js`, `frontend/src/pages/ProfilePage.test.js`; chạy `npm test --prefix backend`, `npm test --prefix frontend -- --watchAll=false --runInBand`, `npm run build --prefix frontend`. Mock không thay kiểm tra đăng nhập cũ/mới trên môi trường được phép; không công khai thông tin đăng nhập test.
