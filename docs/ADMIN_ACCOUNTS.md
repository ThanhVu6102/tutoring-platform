# Quản lý tài khoản — FE/BE #03 / issue #63

## Phạm vi

Trang `/admin/accounts` dành cho admin, mở bằng **Quản lý tài khoản** trên navbar (menu thu gọn trên mobile). Phân loại dựa trên role trong database, không xác minh nghề nghiệp/danh tính ngoài đời.

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

`GET /api/users` nay trả **400** cho lỗi validation page/limit từ helper `readPage`, thay vì rơi vào `sendError` và trả 500. Sửa giới hạn ở route danh sách user, không thay helper lỗi dùng chung hoặc nới validation.

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

Report/screenshot ở `docs/local/security/accounts-ui-<id>/`, ignored; không đưa credential/hash/JWT lên Git/issue. Các lượt lỗi cũng giữ dấu vết và dọn đúng tài nguyên lab. Kết quả local không thay nghiệm thu của chủ dự án hoặc kiểm chứng deployment.

## Phối hợp review

Hai subagent Gemini ban đầu bị quota; agent chính triển khai trực tiếp. Lượt thử lại audit backend và review frontend đã trả kết quả, không phát hiện blocker; agent chính kiểm tra lại contract và tích hợp. Test thật vẫn phát hiện lỗi page/limit trả 500 và vấn đề label/harness ngoài review; các kết luận subagent không được dùng thay test. Primary chịu trách nhiệm cuối cho quyết định bảo mật và bàn giao.

## Bằng chứng ngày 2026-11-14

Source nhánh `feat/admin-account-management` trên develop `8d6e088`, chưa tự merge/phát hành:

| Kiểm tra | Kết quả |
|---|---|
| Backend unit/HTTP | **139/139**, gồm lỗi pagination user trả 400 trước query collection |
| Frontend | **97/97**, 15 suite; thêm form/filter/session và route/navbar |
| Build frontend | Thành công; initial JS gzip **81,64 kB**, trang mới lazy-load |
| Tài khoản: HTTP/MongoDB/Chromium | **27/27**: 3 nhóm HTTP/MongoDB + 8 nhóm UI/route cho mỗi viewport 1440×1000, 1024×900 và 390×844 |
| Chromium hồi quy chung | **27/27** trên desktop/mobile, ba vai trò |
| MongoDB hồi quy | **36/36**, 4 suite tính cả test bao ngoài (kháng cáo, lọc lớp, kiểm duyệt, học liệu) |
| Audit backend `--omit=dev` | **0 vulnerabilities** tại thời điểm chạy; không đại diện audit frontend |

Report cuối local: `accounts-ui-47ee3b6a170aa7b7ce839d6e/report.json`, hồi quy `browser-affc28444e2c3b09f41fe4b1/report.json`. Các lượt cuối tự xác nhận DB/container đã dọn. Đã xem ảnh form từ chối mobile và trang tablet; icon decor admin không còn đè nút, nhãn/textarea có liên kết rõ ràng.

Dấu vết lỗi không bị bỏ qua: `accounts-ui-e3184d528f4ae0ca81a3d560` bắt lỗi backend 500 thay 400; `accounts-ui-fc2cec496791aead7eef15b7` lỗi label/waiter khiến tiến trình kết thúc trước cleanup; `accounts-ui-8eb9f5f5f74caa276e250764` lỗi harness unroute trước fulfill. Hai lượt kết thúc bất thường đã được agent xác minh **đúng nhãn owner/run + địa chỉ loopback**, drop đúng DB và xóa đúng container, ghi report local bổ sung. Không xóa container hoặc dữ liệu không thuộc lượt chạy. Đã sửa harness/label, chạy lại toàn bộ rồi mở rộng kiểm tra cạnh tranh thật và viewport tablet; không dùng lượt lỗi làm bằng chứng đạt.

Issue #63 giữ Open / In review sau commit/push; chờ review, chủ dự án nghiệm thu và duyệt PR/merge. Không tự suy ra Done từ test local hoặc quyền commit/push.
