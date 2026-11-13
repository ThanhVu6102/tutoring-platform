# Quản lý tài khoản

## Phạm vi

Trang `/admin/accounts` dành cho admin, mở bằng **Quản lý tài khoản** trên navbar (menu thu gọn trên mobile). Phân loại dựa trên role trong database, không xác minh nghề nghiệp/danh tính ngoài đời.

Trang dùng chung cơ chế vai trò và xét duyệt tài khoản với backend. Danh sách học sinh trong Hồ sơ vi phạm phục vụ nghiệp vụ kiểm duyệt riêng, không thay danh sách quản lý tài khoản.

- Tên/email, vai trò **Học sinh / Giáo viên / Quản trị viên**, trạng thái **Chờ duyệt / Đang hoạt động / Tạm nghỉ / Đã rời trung tâm / Bị từ chối**.
- Trạng thái khóa/đình chỉ hiển thị riêng với trạng thái vòng đời. Legacy thiếu status hiển thị đang hoạt động theo chính sách backend hiện có.
- Tìm tên/email có debounce 300 ms; lọc role/status, tổng và phân trang từ server. Mỗi lần lấy 20 tài khoản, không tải toàn bộ để lọc client; đổi/xóa bộ lọc về trang 1.
- Duyệt/từ chối chỉ hiện cho giáo viên pending, có form xác nhận, hủy, chặn gửi lặp; từ chối cho ghi chú tùy chọn tối đa 2000 ký tự. Làm mới giữ bộ lọc; server tự điều chỉnh trang nếu hết kết quả.
- Không có đổi vai trò, khóa/mở khóa/xóa tài khoản, reset mật khẩu hoặc sửa hồ sơ người khác ở trang này. Trang tài khoản học sinh cũ trong Hồ sơ vi phạm vẫn giữ nguyên.

## Contract hiện có

| API | Phạm vi |
|---|---|
| `GET /api/users?search=&role=&status=&view=moderation&page=1&limit=20` | Admin; tìm tên/email literal có escape regex, lọc role/status, trả `{data,page,limit,total,totalPages}` |
| `PUT /api/users/:id/approve` với `{}` | Admin; chỉ teacher pending chưa xóa, chuyển active |
| `PUT /api/users/:id/reject` với `{note}` | Admin; chỉ teacher pending chưa xóa, chuyển rejected |

Giữ các role/status/schema/JSON keys hiện có. `view=moderation` lấy metadata, không tải avatar base64. DTO không trả mật khẩu/hash/revision hoặc trường nội bộ; quyền và trạng thái hiện tại luôn kiểm tra từ DB, không tin role sửa trong localStorage/JWT. Không thêm thư viện, migration hoặc dữ liệu mẫu trong ứng dụng.

`GET /api/users` trả **400** nếu page/limit không hợp lệ; mặc định 20 tài khoản/trang, giới hạn 100.

Quyết định xét duyệt dùng compare-and-set theo `teacher + pending + deletedAt:null`; đối thủ hoặc hồ sơ đã xử lý trả 409, không ghi đè. Metadata người/thời điểm/ghi chú nằm trong user. Audit log tiếp tục best-effort theo [luồng tài khoản](MONGODB_WORKFLOW.md), không tuyên bố audit cùng transaction với user.

## Lỗi, phiên và giao diện

- Loading/rỗng/lỗi/thử lại phân biệt; dữ liệu lỗi server bất ngờ không được hiển thị nguyên văn.
- Ghi lỗi giữ ghi chú, đọc lại để kiểm tra trước lần xác nhận tiếp; 409 đóng form và chỉ làm mới GET, không tự gửi lại PUT.
- 401/403/423 ẩn dữ liệu cũ; khóa trang theo token/userId/role lúc mở, kiểm tra storage/focus và trước/sau thao tác bất đồng bộ. Backend vẫn là lớp bảo vệ quyền thực sự.
- Form có label riêng, focus vào phần xác nhận và trả về nút khi hủy; cards và bộ lọc responsive. Navbar admin cho nút xuống dòng, không để icon trang trí đè mục mới.
- Không thêm phát hiện thay role theo thời gian thực: khi admin bị hạ quyền ở DB, request tiếp theo bị backend từ chối và UI ẩn dữ liệu.

## Kiểm thử

```powershell
npm test --prefix backend
npm test --prefix frontend -- --watchAll=false --runInBand
npm run build --prefix frontend
npm run test:accounts:browser --prefix backend -- --tools-dir 'C:\path\to\temporary-playwright-tools'
```

`accounts-ui-smoke.js` tạo lab MongoDB Docker replica set sở hữu riêng và dùng production build/router thật, không nạp `.env` hoặc nhận URI ngoài. Admin đăng nhập qua UI; token giả đã ký chỉ dùng kiểm tra route/API từ chối cho student/teacher. Kiểm tra phân trang/filter, privacy, xác nhận/submit lặp, ghi chú, người/thời điểm/audit thật, đăng nhập trước/sau xét duyệt và hai quyết định cạnh tranh trên MongoDB. Browser chặn mạng ngoài trước khi nhập credential giả; không kiểm tra tài khoản production hoặc gửi thông tin ra dịch vụ khác.

Report/screenshot ở `docs/local/security/accounts-ui-<id>/`, ignored; không đưa credential/hash/JWT lên Git. Kết quả kiểm tra và trạng thái triển khai ở [PROJECT_STATUS.md](PROJECT_STATUS.md).
