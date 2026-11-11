# BE #04 — Thiết kế phân trang hồ sơ kiểm duyệt đã được xác nhận

## Mục tiêu và tương thích

Giảm tải khởi tạo `AdminModeration` đang đọc hết lớp/user và toàn bộ cảnh báo. Lab local đo 23 request và 2.250.251 byte giải nén với 2.000 user / 400 lớp / 2.000 cảnh báo; đây không phải số đo production.

Không thay contract các API hiện hành: `/api/student-warnings` và `/mine` vẫn trả mảng; các API lớp/user giữ response hiện có. Không đổi trang hồ sơ, chuông thông báo hoặc BE #03. Thêm namespace riêng `/api/moderation` chỉ cho admin.

## API đề xuất

| Method / URL | Thành công | Quy tắc |
|---|---|---|
| `GET /api/moderation/summary` | `{totalWarnings, openWarnings, violationClasses}` | Tổng cảnh báo, pending/appealed, lớp trong phạm vi hiển thị hiện tại; không ước lượng hoặc lấy length trang |
| `GET /api/moderation/warnings?page=1&limit=20&status=appealed` | `{data, page, limit, total, totalPages}` | Status tùy chọn theo enum cảnh báo; sort issuedAt desc, _id desc; populate DTO gọn phục vụ thẻ cảnh báo |
| `GET /api/moderation/students?page=1&limit=20` | `{data, page, limit, total, totalPages}` | Học sinh chưa xóa mềm thuộc nhóm ảnh hưởng hiện tại; sort createdAt desc, _id desc |
| `GET /api/moderation/classes?page=1&limit=20` | `{data, page, limit, total, totalPages}` | Lớp inactive hoặc có thông báo hiện tại khác none; sort createdAt desc, _id desc |

Phân trang dùng quy tắc chung BE #04: mặc định 20, tối đa 100; tham số không phải số nguyên dương trả 400, vượt trần được giới hạn. Status không hợp lệ ở endpoint mới trả 400; không sửa cách xử lý tham số của endpoint cũ.

Mọi route mới kiểm tra token và admin từ database, dùng `private, no-store`, không nhận role/admin qua query. Không trả password, token, avatar base64 hoặc trường nội bộ. Lọc user references theo BE #01/#02; danh sách student gốc cũng dùng DTO.

## Giữ đúng nghiệp vụ hiện tại

- Học sinh thuộc nhóm ảnh hưởng khi có **bất kỳ cảnh báo nào** (kể cả đã dismissed), hoặc classRemovalIncidents > 0, disciplinarySanctions > 0, permanentlyBanned, suspendedUntil còn hiệu lực. Giữ điều kiện role student và chưa xóa mềm như danh sách user hiện có.
- Không đưa danh sách toàn bộ ID học sinh có cảnh báo ra Node/client. Dùng query/aggregation phía MongoDB, kiểm tra tồn tại cảnh báo bằng lookup có giới hạn rồi mới phân trang, dùng cùng điều kiện để đếm.
- Lớp chỉ có lockNoticeHistory nhưng hiện active và lockNotice none vẫn không nằm trong tab lớp theo bộ lọc UI hiện tại. Không âm thầm mở rộng tiêu chí hiển thị.
- Các route đọc mới vẫn chờ `finalizeExpiredStudentWarnings()` như luồng kiểm duyệt hiện có, giữ transaction và chống xử lý trùng. Chưa có job nền hoặc thay hạn kháng cáo/chế tài. Vì vậy trường hợp rất nhiều pending hết hạn có thể vẫn chậm và cần phép đo riêng.
- Tổng là exact count tại lúc query; các request summary/list không có snapshot chung. Có thể lệch tạm khi có quyết định mới giữa hai request, sau refresh sẽ cập nhật. Không thêm transaction đọc toàn bộ chỉ để đồng bộ hai request giao diện.
- Review giữ `PATCH /api/student-warnings/:warningId/review`; xử lý đồng thời hoặc đã xử lý vẫn trả lỗi theo BE #03, không thêm quyền dismiss độc lập của #13.

## FE cần cập nhật và nghiệm thu riêng

- Giữ ba tab và bố cục/thẻ hiện có trong `frontend/src/pages/AdminModeration.js`.
- Thay `getAllPages` và lọc chéo ở client bằng các API trên; mở màn hình gọi summary và một trang warnings (mục tiêu 2 request), không tải students/classes khi chưa mở tab.
- Dùng `usePagedList`/`Pagination` sẵn có; giữ vị trí trang từng tab và tải theo nhu cầu, loading/error/empty/retry; bỏ response cũ khi chuyển trang/tài khoản.
- Sau review: khóa thao tác gửi lặp, cập nhật summary, làm mới warnings và đánh dấu các tab bị ảnh hưởng cần tải lại. Không tải toàn bộ mọi trang để tính lại tổng.
- Mỗi tab hiển thị tổng từ server, không dùng data.length cho số tổng. Responsive/bàn phím kế thừa component hiện có nhưng vẫn cần kiểm tra trình duyệt và chủ dự án nghiệm thu.
- Chưa thêm search/filter teacher/grade/sort UI của #12, không đổi theme hoặc thêm dependency.

## File dự kiến

- Backend: `backend/routes/moderation.js`, `backend/utils/moderation.js`, đăng ký trong `backend/server.js`, test API/phân quyền và test tích hợp MongoDB tương ứng.
- Frontend: `frontend/src/pages/AdminModeration.js`, test màn hình; chỉ sửa hook dùng chung nếu thật sự cần invalidation và có test hồi quy.
- Lab: thêm workload summary + trang warnings đầu, giữ workload cũ làm đối chứng; đo cùng dataset khi so sánh. Cập nhật `docs/PERFORMANCE.md` và API docs sau triển khai.

## Kiểm thử trước nghiệm thu

- Admin được phép; student/teacher/chưa đăng nhập bị chặn. Query role/userId không vượt quyền.
- Nhiều hơn một trang; exact total, trang rỗng, filter status, tham số sai; user xóa mềm/đổi role; cảnh báo đã gỡ và quan hệ bị thiếu.
- Tính tổng/nhóm học sinh/lớp khớp quy tắc UI cũ trên cùng fixture, không bị cắt ở trang đầu.
- Xác nhận cảnh báo hết hạn trước query và không làm hồi quy transaction/chống quyết định trùng của BE #03.
- FE chỉ tải summary + tab đang mở; không gọi getAllPages hoặc ba danh sách toàn bộ; chuyển tab/trang, lỗi API, retry và refresh sau review.
- Lab MongoDB thật: số request/payload mới so với legacy trên cùng dataset và query plan. Không hứa mục tiêu latency trước khi đo.
- Không đóng #11 chỉ vì BE/API hoặc test mock đạt; còn FE, nén deployment, phạm vi #12 và các tiêu chí chưa được chốt/nghiệm thu.

## Trạng thái

Chủ dự án đã duyệt triển khai cả BE và FE theo thiết kế này, sau đó yêu cầu commit/push lên branch phù hợp. API/màn hình đã qua test, tích hợp MongoDB và lab; số đo/giới hạn được ghi trong `PERFORMANCE.md`. Branch dùng bàn giao là `perf/api-loading`; chưa merge/apply production hoặc nghiệm thu giao diện, không coi đây là hoàn thành toàn bộ #11.
