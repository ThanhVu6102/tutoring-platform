# Luồng tài khoản, buổi học và điểm danh

Tài liệu mô tả hành vi đã tích hợp, không phải kế hoạch theo branch cũ. Quy tắc kháng cáo/chế tài chi tiết ở [APPEALS.md](APPEALS.md); dữ liệu được phép trả ở [USER_PRIVACY.md](USER_PRIVACY.md).

## 1. Tài khoản

- Giữ ba role `admin`, `teacher`, `student`. Học sinh đăng ký được active; giáo viên chờ admin duyệt và chưa nhận token.
- Đăng ký yêu cầu `acceptedPolicies: true`, lưu thời điểm/phiên bản chấp nhận chính sách.
- `PUT /api/users/:id/approve` hoặc `/reject` xét duyệt nguyên tử tài khoản giáo viên pending, lưu người/thời điểm/ghi chú xử lý.
- Middleware lấy role và trạng thái hiện tại từ DB; kiểm tra xóa mềm, khóa thủ công, cấm vĩnh viễn và đình chỉ. Tài khoản legacy thiếu status vẫn hoạt động nếu không có hạn chế khác.
- Metadata xét duyệt nằm cùng user document; audit log là best-effort, không thay tính nguyên tử của quyết định.

## 2. API buổi học và điểm danh

Mọi endpoint yêu cầu `Authorization: Bearer <token>` và quyền lớp tương ứng.

| Method / URL | Chức năng |
|---|---|
| `POST /api/classes/:id/sessions` | Giáo viên phụ trách/admin tạo buổi học |
| `GET /api/classes/:id/sessions?page=1&limit=20` | Danh sách phân trang, limit tối đa 100 |
| `GET /api/sessions/:id` | Chi tiết, không kèm toàn bộ danh sách điểm danh |
| `PUT /api/sessions/:id/status` | Chuyển trạng thái buổi học |
| `GET /api/sessions/:id/attendances` | Giáo viên/admin xem danh sách; student chỉ xem điểm danh của mình |
| `POST /api/sessions/:id/check-in` | Giáo viên/admin ghi điểm danh |

Ví dụ body tạo buổi học:

```json
{
  "title": "Ôn tập chương 1",
  "startsAt": "2026-11-01T19:00:00+07:00",
  "endsAt": "2026-11-01T20:30:00+07:00",
  "location": "Phòng 201"
}
```

## 3. Quy tắc dữ liệu

- Ngày giờ phải có múi giờ, kết thúc sau bắt đầu. Tạo buổi học yêu cầu Atlas/replica set: transaction khóa ghi teacher/class trước khi kiểm tra trùng lịch giáo viên. MongoDB standalone trả `503`, không fallback sang ghi rời rạc.
- Điểm danh được nhúng trong session, khởi tạo `absent` cho học sinh thuộc lớp lúc tạo. Học sinh vào sau không tự được thêm vào danh sách buổi học cũ.
- Body điểm danh: `{ "student_id": "<ObjectId 24 ký tự hex>", "status": "present", "note": "" }`. Status: `present`, `absent`, `late`, `excused`; chỉ cập nhật buổi ongoing/completed. Student phải còn thuộc lớp và có trong danh sách lúc tạo buổi.
- Chuyển trạng thái: `scheduled → ongoing/completed/cancelled`, `ongoing → completed/cancelled`. Không mở lại trạng thái kết thúc.
- Lớp khóa/lưu trữ chặn student và thao tác ghi điểm danh/trạng thái; quản lý vẫn đọc lịch sử. Không tạo buổi trong lớp inactive.
- Xóa lớp chuyển thành lưu trữ để giữ lịch sử; giữ luồng admin mở lại lớp và xử lý khóa/kháng cáo hiện có. Người tạo, người đổi trạng thái, người điểm danh được lưu trực tiếp; audit log best-effort.

## 4. Kiểm thử và ngoài phạm vi

`npm test --prefix backend` kiểm tra nghiệp vụ bằng mock/HTTP; không thay kiểm chứng transaction và cạnh tranh trên replica set thật.

Chưa có tự điểm danh/QR, dời lịch, kiểm tra trùng lịch học sinh/phòng, màn hình buổi học/điểm danh riêng; các hạng mục hồ sơ gia sư/phụ huynh/học phí/đánh giá, email kích hoạt và refresh token không thuộc phần tích hợp này. Bảo mật cấu hình admin/JWT là phạm vi riêng, không được coi đã xử lý bởi các API này.
