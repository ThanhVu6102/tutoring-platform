# BE #03 — API kháng cáo

Phạm vi đã xác nhận cho [issue #24](https://github.com/ThanhVu6102/tutoring-platform/issues/24): hoàn thiện kháng cáo **cảnh báo học sinh** và **thông báo khóa lớp**. Trang kháng cáo riêng thuộc FE #08 / issue #20; frontend có thể dùng các contract dưới đây.

## Xác thực và dữ liệu

Mọi endpoint yêu cầu `Authorization: Bearer <token>`. Vai trò và trạng thái tài khoản lấy từ database. Tài khoản đang đình chỉ/bị khóa vẫn bị chặn bởi middleware hiện hành. Danh tính gửi/duyệt lấy từ phiên đăng nhập; các trường danh tính trong request không thay thế được người thực hiện.

- ID phải là ObjectId 24 ký tự hex.
- `message`: chuỗi bắt buộc, trim, tối đa 3000 ký tự.
- `details`: chuỗi bắt buộc, trim, tối đa 2000 ký tự.
- `response`: chuỗi tùy chọn, tối đa 2000 ký tự; bỏ trống được dùng phản hồi mặc định ở cảnh báo học sinh, chuỗi rỗng ở khóa lớp.
- `policyLevel`: số `1`/`2`/`3` hoặc chuỗi tương ứng để tương thích form hiện có. Boolean/array/object bị từ chối.
- `reasonCode`: `spam`, `abusive_content`, `copyright`, `account_sharing`, `academic_fraud`, `illegal_content`, `privacy_breach`, `financial_misconduct`, `class_disruption`, `other`.
- Giới hạn chiều dài được kiểm tra trước khi trim; `null` không thay cho chuỗi tùy chọn.

Lỗi nghiệp vụ trả `{ "message": "..." }`: `400` dữ liệu sai, `401` thiếu/sai phiên, `403` sai quyền, `404` không tìm thấy trong phạm vi được xem, `409` hết hạn/sai trạng thái/thao tác đã được xử lý, `423` bị đình chỉ hoặc lớp không phù hợp, `503` MongoDB không hỗ trợ transaction. Lỗi nội bộ trả `500` với thông báo chung.

## Cảnh báo học sinh

| Method / URL | Quyền và body | Response thành công |
|---|---|---|
| `POST /api/student-warnings/:studentId` | Admin; `{classId, reasonCode, policyLevel, details}`; học sinh phải thuộc lớp đang hoạt động | `201 {message, warning}` |
| `GET /api/student-warnings/mine` | Học sinh; chỉ cảnh báo của chính mình | `200 [warning, ...]` |
| `GET /api/student-warnings?status=appealed` | Admin; filter tùy chọn theo enum trạng thái | `200 [warning, ...]` |
| `POST /api/student-warnings/:warningId/appeal` | Học sinh chính chủ; `{message}` | `200 {message, warning}` |
| `PATCH /api/student-warnings/:warningId/review` | Admin; `{decision: "confirm" hoặc "dismiss", response?}` | `200 {message, warning}`; populate `student`/`class` như trước |

Các danh sách cảnh báo vẫn trả **mảng**; danh sách lớp vẫn dùng phân trang BE #04. Chính sách lọc hồ sơ [BE #01/#02](USER_PRIVACY.md) tiếp tục áp dụng cho user lồng trong response.

### Chuyển trạng thái

| Trạng thái đầu | Hành động/điều kiện | Kết quả |
|---|---|---|
| `pending` | Chính chủ gửi khi `appealDeadline > thời điểm nhận thao tác` | `appealed` |
| `appealed` | Admin `dismiss` | `dismissed`, không tính vi phạm |
| `appealed` | Admin `confirm` | `confirmed`, tính vi phạm trong transaction |
| `pending` | Hết hạn 7 ngày, chưa gửi kháng cáo | `confirmed` qua xử lý hết hạn |
| `confirmed` / `dismissed` | Gửi/xét duyệt lại | `409`; giữ quyết định cũ |

Đúng thời điểm deadline là đã hết hạn. Kháng cáo đã gửi đúng hạn tiếp tục chờ admin dù deadline đã qua. Xử lý hết hạn chỉ chọn lại `pending` và deadline đã hết trong transaction, không tự xác nhận kháng cáo vừa được nhận từ một danh sách đọc cũ.

Xử lý hết hạn chạy khi đọc danh sách `/mine` hoặc danh sách admin; hiện chưa có cron. POST kháng cáo quá hạn trả `409`, không chạy xử lý các cảnh báo khác của người gửi. Admin chỉ review thủ công cảnh báo đã `appealed`.

### Số đếm, gỡ lớp và chế tài

1. Cảnh báo đã xác nhận được tính đúng một lần; đủ 3 cảnh báo trong cùng lớp thì gỡ học sinh nếu vẫn có trong roster.
2. Gỡ học sinh, đồng bộ `enrolledClasses`, ghi số đếm và quyết định cùng transaction. Lỗi ở bất kỳ bước nào rollback toàn bộ lần xác nhận đó.
3. Khóa ghi nội bộ `User.warningRevision` tuần tự hóa các cảnh báo khác nhau của cùng học sinh, tránh hai transaction cùng đọc số đếm cũ.
4. `classRemovalIncidents` chỉ tăng khi thực sự gỡ và lớp đó chưa có cảnh báo đánh dấu `classRemovalApplied`. Gỡ lặp hoặc quay lại cùng lớp không tạo sự việc ở một lớp khác.
5. Sự việc ở lớp thứ hai dẫn đến đình chỉ 7 ngày; sự việc tiếp theo 30 ngày, sau đó khóa vĩnh viễn. Các bộ đếm lịch sử được giữ nguyên; không đặt lại số cảnh báo khi vào lại lớp.

`classRemovalApplied` ghi một lần gỡ thực tế; `accountSanction` cho biết chế tài phát sinh từ cảnh báo đó. Các số đếm cũ chưa được sửa ngược hoặc suy đoán lại trong bản thay đổi này.

## Thông báo khóa lớp

| Method / URL | Quyền và body | Response thành công |
|---|---|---|
| `PATCH /api/classes/:id/lock-notice` | Admin; `{reasonCode, policyLevel, details}` | `202 {message, class}` |
| `POST /api/classes/:id/lock-appeal` | Giáo viên phụ trách; `{message}` | `200 {message}` |
| `PATCH /api/classes/:id/lock-review` | Admin; `{decision: "lock" hoặc "dismiss", response?}` | `200 {message, class}` |
| `PATCH /api/classes/:id/status` | Admin; `{status: "active"}` | `200 {message, class}` |
| `GET /api/classes/:id` | Theo quyền lớp hiện hành | Chi tiết lớp gồm thông báo/lịch sử theo người xem |
| `GET /api/classes?view=history` | Giáo viên chỉ lớp phụ trách; admin mọi lớp | `{data, page, limit, total, totalPages}` |

- Thông báo mới ở `pending`, hạn 24 giờ; lớp vẫn `active`.
- Giáo viên chỉ gửi một lần khi còn `pending`, lớp đang hoạt động và chưa hết hạn; chuyển sang `appealed`.
- Admin review khi đã `appealed`, hoặc `pending` đã hết hạn. `lock` đưa lớp sang `inactive`, thông báo `locked`.
- `dismiss` lưu thông báo `dismissed` vào `lockNoticeHistory`, rồi đưa thông báo hiện tại về `{status: "none"}`. Quy tắc này giữ dạng response mà UI đang dùng.
- Mở lại lớp lưu quyết định khóa ban đầu cùng `reopenedAt`, `reopenedBy`, `reopenResponse`; không sửa người duyệt, phản hồi, thời điểm quyết định khóa trước đó.
- API mở lớp cũ vẫn cho admin hủy một thông báo chưa chốt; lịch sử ghi `dismissed` với người/thời điểm hủy. Mở lớp đã active và không có thông báo trả `409`.
- `lockRevision` là phiên bản ghi nội bộ. Quyết định và bản ghi lịch sử được cập nhật nguyên tử trong cùng document; request cạnh tranh thua trả `409`.
- Giáo viên phụ trách/admin nhận nội dung kháng cáo và lịch sử. Học sinh chỉ nhận `lockNotice.status`; không nhận nội dung, người xử lý hay `lockNoticeHistory` qua danh sách/chi tiết lớp.

## Metadata và dữ liệu cũ

- Cảnh báo thêm `appealedBy`, `reviewedBy`; giữ `issuedBy`, `appealedAt`, `resolvedAt` hiện có. Xác nhận tự động đặt `reviewedBy: null` thay vì gán một admin giả.
- Thông báo/lịch sử lớp thêm `issuedBy`, `appealedBy`, `reviewedBy`, `reopenedBy`, `reopenedAt`, `reopenResponse`.
- Các trường danh tính mới là tùy chọn; hồ sơ cũ thiếu thông tin vẫn đọc được. Không backfill/migration dữ liệu thật. Trường nội bộ `warningRevision`/`lockRevision` không nằm trong payload hồ sơ được phép trả.
- Giới hạn văn bản mới được kiểm tra ở API; phản hồi khóa lớp cũ dài hơn giới hạn vẫn được giữ nguyên khi chuyển vào lịch sử.
- MongoDB standalone vẫn dùng được các thao tác một document; xác nhận vi phạm và xử lý hết hạn yêu cầu replica set/Atlas, trả `503` nếu không hỗ trợ, không fallback sang ghi rời rạc.
- Việc chống trùng áp dụng lên trạng thái/phiên bản hiện tại. Endpoint lớp hiện dùng class ID, chưa có khóa idempotency hoặc ID thông báo do client gửi; sau khi tạo thông báo mới, client cần tải lại trạng thái trước thao tác tiếp.

## Kiểm thử

```powershell
# Unit + HTTP mock, cùng các bộ test hồi quy hiện có
npm test --prefix backend

# URI phải trỏ vào replica set thử nghiệm được phép ghi dữ liệu
$env:APPEALS_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27027/?replicaSet=appeals-rs&directConnection=true'
npm run test:appeals:integration --prefix backend
```

`tests/appeals.integration.test.js` tạo database `appeals_test_<random>` rồi xóa chính database đó khi kết thúc. Script yêu cầu biến môi trường test riêng, không dùng `MONGODB_URI`, không nạp `.env` hoặc gọi bootstrap admin. Fixture chỉ phục vụ test.

Bộ tích hợp kiểm tra HTTP gửi/xem/duyệt, deadline, người thực hiện, dữ liệu cũ, quyền xem lớp, các cặp request đồng thời, bộ đếm qua nhiều lớp và rollback thật khi cố tình gây lỗi ở bước lưu cuối. Unit test bổ sung payload sai, thiếu quyền, xử lý `503` và che lỗi nội bộ.

Kiểm thử API dùng contract của các màn hình hiện có (`ClassDetail`, `AdminClassDetail`, `AdminModeration`, `ProfilePage`); nghiệm thu màn hình kháng cáo riêng của #20 là công việc frontend tiếp theo.

## Vị trí triển khai

- `backend/utils/appealValidation.js`: validation và ánh xạ lỗi nghiệp vụ.
- `backend/utils/studentWarnings.js`: gửi/xét duyệt cảnh báo, transaction và xử lý hết hạn.
- `backend/utils/classLockNotices.js`: chuyển trạng thái/lịch sử nguyên tử và lọc hồ sơ kháng cáo của giáo viên.
- `backend/routes/studentWarnings.js`, `backend/routes/classes.js`: quyền theo vai trò và contract HTTP.
- Các model `StudentWarning`, `Class`, `User`: metadata/phiên bản nội bộ tương thích hồ sơ cũ.
- `backend/server.js`: danh sách endpoint rút gọn tại `/api/docs`.
