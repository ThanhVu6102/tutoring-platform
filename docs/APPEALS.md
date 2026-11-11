# Kháng cáo và kiểm duyệt

Contract backend của [issue #24](https://github.com/ThanhVu6102/tutoring-platform/issues/24): kháng cáo **cảnh báo học sinh** và **thông báo khóa lớp**. Trang kháng cáo riêng thuộc FE #08 / issue #20; tài liệu này không thay trạng thái nghiệm thu frontend.

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

Các danh sách cảnh báo cũ vẫn trả **mảng**; quản trị có [API kiểm duyệt phân trang riêng](#kiem-duyet). Danh sách lớp theo [BE #04](PERFORMANCE.md), user lồng theo [quy tắc hồ sơ](USER_PRIVACY.md).

### Chuyển trạng thái

| Trạng thái đầu | Hành động/điều kiện | Kết quả |
|---|---|---|
| `pending` | Chính chủ gửi khi `appealDeadline > thời điểm nhận thao tác` | `appealed` |
| `appealed` | Admin `dismiss` | `dismissed`, không tính vi phạm |
| `appealed` | Admin `confirm` | `confirmed`, tính vi phạm trong transaction |
| `pending` | Hết hạn 7 ngày, chưa gửi kháng cáo | `confirmed` qua xử lý hết hạn |
| `confirmed` / `dismissed` | Gửi/xét duyệt lại | `409`; giữ quyết định cũ |

Đúng thời điểm deadline là đã hết hạn. Kháng cáo đã gửi đúng hạn tiếp tục chờ admin dù deadline đã qua. Xử lý hết hạn chỉ chọn lại `pending` và deadline đã hết trong transaction, không tự xác nhận kháng cáo vừa được nhận từ một danh sách đọc cũ.

Xử lý hết hạn chạy khi đọc `/mine`, danh sách admin và các endpoint kiểm duyệt; chưa có cron. POST kháng cáo quá hạn trả `409`, không xử lý các cảnh báo khác của người gửi. Admin chỉ review thủ công cảnh báo đã `appealed`.

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

<a id="kiem-duyet"></a>
## Danh sách kiểm duyệt

Các GET dưới `/api/moderation` chỉ dành cho **admin lấy từ DB**, dùng `private, no-store`; query role/userId không mở quyền. Giữ bộ lọc hồ sơ; danh sách không trả secret, ảnh đại diện base64, roster hoặc toàn bộ lịch sử.

| GET endpoint | Response / phạm vi |
|---|---|
| `/summary` | `{totalWarnings, openWarnings, violationClasses}`; open là pending/appealed |
| `/warnings?page=1&limit=20&status=appealed` | Trang cảnh báo, status tùy chọn theo enum; sort issuedAt desc, `_id` desc |
| `/students?page=1&limit=20` | Trang student chưa xóa mềm có cảnh báo bất kỳ, kể cả dismissed, hoặc có chế tài; sort createdAt desc, `_id` desc |
| `/classes?page=1&limit=20` | Trang lớp inactive hoặc thông báo hiện tại khác none; sort createdAt desc, `_id` desc |

- Ba danh sách trả `{data, page, limit, total, totalPages}` theo [quy tắc chung](PERFORMANCE.md): mặc định 20, tối đa 100, tham số sai/status ngoài enum trả `400`, page/limit vượt trần được cap.
- Nhóm student gồm người có cảnh báo hoặc classRemovalIncidents > 0, disciplinarySanctions > 0, permanentlyBanned hay suspendedUntil còn hiệu lực. Lookup giới hạn 1 kiểm tra tồn tại cảnh báo trước paging/count; không đưa toàn bộ ID ra client. Facet trang/total dùng cùng filter.
- Lớp active/lockNotice none chỉ có lockNoticeHistory không vào tab vi phạm; khác với `view=history`. Route đọc vẫn chờ finalize pending hết hạn bằng transaction; chưa có job nền, tồn đọng lớn có thể chậm. Tổng exact từng query, summary/list không có snapshot chung.
- `AdminModeration` mở summary + warnings trang đầu (2 request). Bốn tab giữ trang riêng, tải theo nhu cầu; tài khoản student dùng `/api/users?role=student&view=moderation` phân trang. Sau review, chặn gửi lặp, làm mới summary/trang hiện tại và đánh dấu tab liên quan cần tải lại; không tải toàn bộ archive để tính tổng.
- Ẩn thẻ cảnh báo chỉ là tùy chọn local của admin, không đổi quyết định; review giữ trạng thái/transaction BE #03, không thêm quyền dismiss độc lập. Loading/lỗi/rỗng/retry và response cũ được xử lý theo cơ chế phân trang chung.
- Mã chính: `backend/routes/moderation.js`, `backend/utils/moderation.js`, `frontend/src/pages/AdminModeration.js`. Bằng chứng parity, quyền, expiry và kiểm tra trình duyệt nằm trong [kết quả BE #04](PERFORMANCE.md#ket-qua).

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

Kiểm thử API không thay nghiệm thu giao diện; trạng thái màn hình kháng cáo riêng được theo dõi tại #20.

## Vị trí triển khai

- `backend/utils/appealValidation.js`: validation và ánh xạ lỗi nghiệp vụ.
- `backend/utils/studentWarnings.js`: gửi/xét duyệt cảnh báo, transaction và xử lý hết hạn.
- `backend/utils/classLockNotices.js`: chuyển trạng thái/lịch sử nguyên tử và lọc hồ sơ kháng cáo của giáo viên.
- `backend/routes/studentWarnings.js`, `backend/routes/classes.js`: quyền theo vai trò và contract HTTP.
- Các model `StudentWarning`, `Class`, `User`: metadata/phiên bản nội bộ tương thích hồ sơ cũ.
- `backend/server.js`: danh sách endpoint rút gọn tại `/api/docs`.
