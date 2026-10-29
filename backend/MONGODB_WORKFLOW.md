# Áp dụng luồng xử lý với MongoDB

## Giai đoạn 1: tài khoản và duyệt giáo viên

- Giữ Express/Mongoose, trường `name`, vai trò `teacher` và các URL hiện tại để tương thích frontend.
- Học sinh đăng ký có trạng thái `active`; giáo viên có trạng thái `pending`, chưa được cấp token.
- Đăng ký yêu cầu mật khẩu tối thiểu 8 ký tự, tối đa 72 byte UTF-8 (giới hạn bcrypt).
- Admin dùng `PUT /api/users/:id/approve` hoặc `PUT /api/users/:id/reject` để xử lý giáo viên đang `pending`.
- Từ chối nhận body tùy chọn `{ "note": "Lý do" }`, tối đa 2000 ký tự.
- Quyết định dùng một `findOneAndUpdate` có điều kiện. Hồ sơ đã xử lý, đã xóa hoặc không phải giáo viên trả `409`; ID sai định dạng trả `400`.
- `User.review` lưu người duyệt, thời điểm và ghi chú cùng lần cập nhật trạng thái. Không cần replica set cho thao tác một document này.
- Collection `AuditLog` tiếp tục nhận bản ghi phụ theo cơ chế best-effort hiện có; chưa có transaction đảm bảo bản ghi ở collection này luôn tồn tại.
- Middleware lấy vai trò từ database, chặn tài khoản bị khóa, xóa mềm hoặc không `active`, kể cả admin.

## Kiểm thử

Chạy `npm test` trong `backend`. Các kiểm thử dùng mock, không cần MongoDB và không thay thế kiểm thử tích hợp hoặc kiểm thử cạnh tranh trên database thật.

## Giai đoạn 2: buổi học và điểm danh

### Lưu trữ và quyền

- Collection `ClassSession` lưu lịch, lớp, gia sư phụ trách và danh sách điểm danh nhúng. Mỗi học sinh có tối đa một dòng trong buổi học.
- Tạo buổi học chụp danh sách `Class.students`, mặc định `absent`. Học sinh thêm vào lớp sau thời điểm này không tự xuất hiện trong buổi cũ; API hiện tại không hỗ trợ sửa danh sách snapshot.
- Admin quản lý mọi lớp; giáo viên chỉ quản lý lớp mình phụ trách. Học sinh chỉ xem buổi của lớp đang tham gia và điểm danh của chính mình, không thấy ghi chú nội bộ hoặc dữ liệu điểm danh của bạn học.
- `DELETE /api/classes/:id` nay lưu trữ lớp (`inactive`), không xóa cứng. Lớp lưu trữ vẫn xem được lịch sử nhưng không tạo thêm buổi hoặc ghi danh mới.

### API mới

| Method | URL | Chức năng |
|---|---|---|
| POST | `/api/classes/:id/sessions` | Tạo buổi học, cần replica set/Atlas |
| GET | `/api/classes/:id/sessions?page=1&limit=20` | Danh sách `{ items, page, limit, total }`, tối đa 100/batch |
| GET | `/api/sessions/:id` | Thông tin buổi, không chứa danh sách điểm danh |
| PUT | `/api/sessions/:id/status` | Chuyển trạng thái, body `{ "status": "ongoing" }` |
| GET | `/api/sessions/:id/attendances` | Danh sách `{ items }`, tự giới hạn theo quyền |
| POST | `/api/sessions/:id/check-in` | Giáo viên/admin cập nhật điểm danh |

Tất cả endpoint yêu cầu `Authorization: Bearer <token>`.

Ví dụ body tạo buổi học:

```json
{
  "title": "Ôn tập chương 1",
  "startsAt": "2026-11-01T19:00:00+07:00",
  "endsAt": "2026-11-01T20:30:00+07:00",
  "location": "Phòng 201"
}
```

Không nhận `teacher`, `createdBy`, danh sách học sinh hoặc `status` từ body tạo buổi. Gia sư được lấy từ lớp; người tạo lấy từ token. Thời gian phải là ISO 8601 có múi giờ và kết thúc sau bắt đầu.

Ví dụ body điểm danh:

```json
{
  "student_id": "ObjectId 24 ký tự của học sinh",
  "status": "present",
  "note": ""
}
```

Trạng thái điểm danh: `present`, `absent`, `late`, `excused`. Chỉ cập nhật buổi `ongoing` hoặc `completed`. Học sinh phải còn trong lớp và có trong snapshot của buổi học. API này không cho học sinh tự check-in hay quét QR.

Luồng trạng thái: `scheduled → ongoing/completed/cancelled`, `ongoing → completed/cancelled`. Không mở lại buổi đã hoàn thành/hủy. Chưa hỗ trợ sửa lịch; muốn đổi lịch, hủy buổi cũ rồi tạo buổi mới.

### An toàn đồng thời

- Tạo buổi dùng transaction ghi khóa trên tài khoản gia sư và lớp trước khi kiểm tra trùng lịch. Các lần tạo cho cùng gia sư phải tranh cùng khóa kể cả ở hai lớp khác nhau.
- Hai buổi trùng nếu `startsAt < other.endsAt` và `endsAt > other.startsAt`; hai buổi nối tiếp được phép. Bỏ qua buổi `cancelled`.
- MongoDB standalone trả `503` cho thao tác tạo buổi, không tự chuyển sang nhiều lệnh không transaction. Đọc, cập nhật trạng thái và điểm danh dùng thao tác một document, không cần replica set.
- Điểm danh cập nhật phần tử có sẵn, không push thêm dòng; cập nhật trạng thái có điều kiện để tránh ghi đè quyết định mới hơn.
- `createdBy`, `statusChangedBy` và `recordedBy` lưu dấu vết trực tiếp. Audit log tạo/chuyển trạng thái tiếp tục best-effort như module tài khoản, chưa đảm bảo transaction với collection audit.
- Chưa kiểm tra trùng lịch học sinh hoặc phòng học; chưa tích hợp giao diện frontend.

## Phạm vi chưa triển khai

- Hồ sơ gia sư/học sinh riêng, phụ huynh và liên kết con.
- Gia sư đăng ký không có mật khẩu, email kích hoạt và refresh token.
- Hóa đơn/thanh toán và đánh giá.
- Transaction nhiều collection: cần MongoDB replica set (ví dụ MongoDB Atlas); không dùng fallback bỏ transaction cho nghiệp vụ tiền hoặc nhiều bản ghi.
- Gia cố cấu hình xác thực: loại bỏ khóa JWT dự phòng, mật khẩu admin mặc định và bổ sung giới hạn đăng nhập trước khi vận hành công khai.

Tài liệu `luồng xử lý.md` là đích nghiệp vụ; các ví dụ SQL không được chạy trực tiếp trên MongoDB. Không có thao tác chuyển đổi hay xóa dữ liệu cũ trong giai đoạn này.
