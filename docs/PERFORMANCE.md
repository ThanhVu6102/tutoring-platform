# BE #04 — Tối ưu tải dữ liệu API và frontend

Theo dõi tại [issue #11](https://github.com/ThanhVu6102/tutoring-platform/issues/11). Tài liệu phân biệt phần đã triển khai, số đo local và phần cần xác minh trên môi trường thử nghiệm; không coi test mock là bằng chứng API production đã nhanh hơn.

## 1. Contract danh sách mới

Các endpoint sau **luôn** trả object phân trang, không còn trả mảng toàn bộ khi thiếu tham số:

- `GET /api/classes`
- `GET /api/users` (admin)
- `GET /api/videos/class/:classId`
- `GET /api/documents/class/:classId`
- `GET /api/assignments/class/:classId`
- `GET /api/announcements/class/:classId`
- `GET /api/quizzes/class/:classId`

Ví dụ cấu trúc, không phải số đo dữ liệu thực:

```json
{ "data": [], "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
```

- Mặc định `page=1`, `limit=20`; giới hạn `limit=100`, `page=10000` để hạn chế offset quá lớn.
- Tham số không phải số nguyên dương trả `400`; giá trị vượt trần được giới hạn. Khi cần vượt trần page, phải thiết kế cursor thay vì bỏ giới hạn.
- Sort có `_id` làm khóa phụ để ổn định thứ tự khi trùng thời điểm/hạn nộp. Không bảo đảm snapshot nhất quán nếu dữ liệu đang bị thay đổi giữa các trang.
- Count và query dữ liệu dùng cùng bộ lọc quyền. Học sinh chỉ thấy lớp active đã tham gia và quiz published.
- Đây là thay đổi contract: backend và frontend liên quan cần phát hành cùng nhau. Client cũ đang dùng response dạng mảng phải được cập nhật.

## 2. Giảm dữ liệu và query

- Danh sách lớp dùng aggregation tính `studentCount`, `joinRequestCount` ở database, không truyền/populate cả roster hoặc yêu cầu tham gia. Chỉ populate giáo viên theo lô.
- Danh sách lớp giữ `search` theo tên cho client cũ và hỗ trợ `subject`, `grade`, `status`. Admin có thêm `q` tìm tên/mô tả (escape regex), `teacher` theo ObjectId hoặc email chính xác và `sort` trong allowlist `newest`, `oldest`, `name_asc`, `name_desc`. `sort` sai trả 400. Học sinh không được dùng query để mở quyền xem lớp inactive; `teacher` và `sort` của admin không mở rộng phạm vi role khác.
- `summary=true` dành cho admin bổ sung tổng lớp/active/inactive trên toàn bộ bộ lọc, không lấy số phần tử của trang hiện tại làm thống kê.
- `view=history` dành cho quản lý lớp lọc lớp có lịch sử/khóa; `view=notifications` lọc các thông báo xử lý còn liên quan. Không thay đổi quyền lớp.
- Danh sách quiz chỉ trả metadata, `questionCount`, `hasPromptImage`; không tải câu hỏi, đáp án hoặc ảnh base64 để vẽ thẻ. Endpoint chi tiết đề giữ cơ chế hiện có.
- Danh sách video/tài liệu/bài tập/thông báo dùng projection và `lean()`, không trả lịch sử lượt xem/tải, bài nộp hay read receipts khi không cần.
- Danh sách user vẫn giữ allowlist theo BE #01/#02. Admin có thể dùng `view=moderation` lấy metadata xử lý kỷ luật thay vì avatar/hồ sơ đầy đủ.
- `GET /api/classes/:id/content-summary` trả tổng video/tài liệu/quiz/bài tập sau khi kiểm tra quyền lớp; tổng quiz của học sinh chỉ tính published.

## 3. Kết nối và HTTP

- Promise cache MongoDB bao trọn cả kết nối và khởi tạo admin; các request cùng cold-start không chạy khởi tạo nhiều lần trong cùng instance.
- Kết nối lỗi sẽ được thử lại ở lần gọi sau. Khởi tạo admin giữ hành vi best-effort hiện có; không thay cơ chế admin hay JWT trong issue này.
- Không thể tái sử dụng một connection giữa các instance serverless độc lập; cold start vẫn có thể xảy ra.
- `Server-Timing: app;dur=...` đo thời gian từ middleware đến lúc ghi response header, không phải thời gian tải mạng hoặc toàn bộ response body.
- API mặc định `Cache-Control: private, no-store`; chỉ `/api/docs` công khai có cache 300 giây. Không tạo shared cache cho hồ sơ hoặc dữ liệu theo vai trò.
- Đặt `PERF_LOG_ENABLED=true` nếu cần timing log. Log chỉ có method, mẫu route, status, duration; không log ID thật, query, body, token hay URI database.
- Chưa thêm dependency `compression`. Cần đo `Content-Encoding` trên deployment để xác minh nén của nền tảng; build thành công không chứng minh response đã được nén.

## 4. Frontend

- Dashboard và trang quản trị lớp tải theo trang; có tìm kiếm debounce ở trang quản trị và giữ dữ liệu cũ khi đang tải lại.
- Chi tiết lớp chỉ tải nhóm học liệu khi mở tab đó, giữ trang đã tải trong vòng đời component và làm mới khi có thao tác tạo/xóa/xuất bản. Overview lấy tổng qua endpoint count riêng.
- GET trùng URL/tham số/token đang chạy được gộp; kết quả hoàn tất không được cache lâu dài. Hai tài khoản không dùng chung request.
- Response cũ không được ghi đè kết quả của URL/filter mới. Khi đổi tài khoản trong lúc đọc nhiều trang, dừng thay vì ghép dữ liệu của hai phiên.
- Tách bundle các route dashboard, quản trị, chi tiết lớp, hồ sơ và làm bài bằng `React.lazy`/`Suspense`.
- Chưa có request lấy reference data môn/khối/vai trò riêng để cần thêm cache; không tạo API/cache giả cho mục này.

### Giới hạn còn giữ để không làm sai nghiệp vụ

- Lịch sử hồ sơ, thông báo giáo viên và trang kiểm duyệt còn cần đọc đủ các trang liên quan qua `getAllPages`. Các request có giới hạn, nhưng tổng dữ liệu client đọc vẫn tăng theo lịch sử.
- Trang kiểm duyệt ở bản giai đoạn 1 còn lọc chéo dữ liệu user/cảnh báo/lớp. Giai đoạn 2 triển khai local API/admin tabs phân trang riêng (mục 8), chưa coi là đã deploy hoặc nghiệm thu FE.
- API cảnh báo, yêu cầu tham gia, roster, bài nộp và các endpoint lịch sử khác ngoài bảy danh sách trên chưa được chuyển toàn bộ sang contract mới.
- Polling 30 giây hiện có được giữ để không thay cơ chế cập nhật thông báo/trạng thái đã có. Chưa thêm WebSocket hoặc cache liên phiên.
- Vì các giới hạn và số đo database còn thiếu, chưa coi toàn bộ issue #11 đã nghiệm thu/đủ điều kiện đóng.

## 5. Index và kiểm tra query plan

Schema bổ sung index khớp filter/sort có `_id`: danh sách lớp toàn hệ thống/theo giáo viên/học sinh và bộ lọc admin theo subject/grade hoặc sắp xếp tên; user theo deletedAt/role; video/tài liệu theo class/uploadedAt; bài tập theo class/dueDate; thông báo/quiz theo class/createdAt và quiz theo status.

```bash
# Chỉ xem định nghĩa: không kết nối hoặc ghi database
npm run perf:indexes --prefix backend

# Chỉ chạy sau khi được phép, cấu hình MONGODB_URI của database thử nghiệm
npm run perf:indexes --prefix backend -- --apply
npm run perf:indexes --prefix backend -- --explain
```

- Script `--apply` dùng `createIndexes`, không dùng `syncIndexes` để tránh xóa index ngoài schema.
- Mongoose vẫn có thể tạo index lúc khởi động tùy cấu hình `autoIndex` của môi trường. Cần review việc tạo index trước khi triển khai schema trên database thật.
- Không tự chạy script trên production. Xem winning plan, docs/keys examined và sort; chỉ cân nhắc bỏ index cũ sau khi có số đo và phê duyệt riêng.
- Search regex contains không được bảo đảm dùng B-tree index; không tuyên bố mọi tìm kiếm sẽ tránh collection scan.
- Tổng chính xác vẫn dùng `countDocuments`; đặc biệt filter rỗng của admin có thể tốn công quét đếm theo quy mô dữ liệu. Chưa thay bằng số ước lượng để tránh đổi ý nghĩa thống kê.
- Chưa chạy `--apply`, `--explain` hoặc benchmark lên MongoDB thật trong lần sửa này. Không có cam kết phần trăm cải thiện latency API khi chưa đo.

## 6. Đo latency và kích thước response

Script benchmark chỉ GET `/api/classes` và `/api/users`, cần tài khoản admin **thử nghiệm**. Cấu hình qua biến môi trường, không đưa token lên command line hoặc commit báo cáo chứa dữ liệu thật:

```powershell
$env:BENCH_BASE_URL = 'http://localhost:5000'
# Cấu hình BENCH_TOKEN riêng trong môi trường; không gửi token vào chat/log.
$env:BENCH_SAMPLES = '10'
$env:BENCH_LABEL = 'before' # đổi thành after khi đo bản mới
npm run perf:benchmark --prefix backend
```

Đo before/after trên cùng dataset, tài khoản, khu vực, loại máy và điều kiện cold/warm tương đương. Báo cáo tách request đầu (không khẳng định chắc chắn là cold start), median/p95 các lần sau, số byte body sau giải nén và Content-Encoding. Không dùng thời gian test mock làm số đo API.

Số đo local ngày 2026-11-03:

| Chỉ số | Trước | Sau |
|--------|-------|-----|
| Initial JS gzip theo CRA build | 94.16 kB | 80.36 kB (giảm khoảng 14.7%) |
| Request ban đầu của overview lớp học sinh | Code cũ gọi chi tiết + 5 danh sách | Test frontend xác nhận chỉ gọi chi tiết + tổng (2 request) |

Build thành công. Đây là số đo bundle local và kiểm tra request bằng mock; chưa phải số đo tốc độ mạng/database thực. Tách bundle không đồng nghĩa giảm tổng dung lượng mọi route cộng lại.

## 7. Kiểm tra trước nghiệm thu

- Chạy `npm test --prefix backend`, `npm test --prefix frontend -- --watchAll=false --runInBand` và `npm run build --prefix frontend`.
- Test hiện kiểm tra pagination, projection/filter quyền, quiz metadata, count theo quyền, connection concurrency, request dedup/stale response và tải tab theo nhu cầu.
- Cần kiểm thử với MongoDB thật, `EXPLAIN`, số đo before/after API và thao tác thực bằng ba vai trò trên Preview/Staging có database/secret riêng.
- Kiểm tra header nén trên Vercel và các luồng quản trị/lịch sử nhiều trang trước khi chuyển sang main.

## 8. Giai đoạn 2 — phân trang kiểm duyệt (local, chờ nghiệm thu)

Thiết kế [phân trang kiểm duyệt](MODERATION_PAGINATION_PLAN.md) đã được chủ dự án xác nhận cho cả BE và FE. Thêm bốn endpoint admin, không đổi response của các API cũ:

- `GET /api/moderation/summary`: `{totalWarnings, openWarnings, violationClasses}` trên toàn bộ dữ liệu, không lấy số phần tử của trang.
- `GET /api/moderation/warnings?page=1&limit=20&status=appealed`.
- `GET /api/moderation/students?page=1&limit=20`.
- `GET /api/moderation/classes?page=1&limit=20`.

Ba danh sách trả `{data, page, limit, total, totalPages}`, mặc định 20 / tối đa 100; số trang vượt trần được cap như bảy danh sách cũ. Status không hợp lệ ở danh sách warnings mới trả 400. Warning list sort `(issuedAt desc, _id desc)`; hai nhóm còn lại sort `(createdAt desc, _id desc)`.

Học sinh ảnh hưởng được lọc ở MongoDB bằng lookup tồn tại cảnh báo (kể cả dismissed), hoặc các cờ/chế tài như UI cũ; chỉ student chưa xóa mềm. Lookup có limit 1 và không đưa danh sách ID toàn bộ ra Node/client; facet tính trang và total sau cùng một bộ lọc. Lớp chỉ có lịch sử nhưng hiện active/none không tự được đưa vào tab lớp.

Các route đều kiểm tra admin từ database trước khi đọc/ghi, giữ BE #01/#02 và `private, no-store`. Các user lồng chỉ populate trường cần cho thẻ, danh sách không trả avatar base64/roster/toàn bộ lịch sử.

`AdminModeration` gọi summary + trang đầu warnings, chỉ tải tab khác khi mở, giữ trang từng tab và dùng component Pagination hiện có. Sau review, làm mới summary/trang đang mở và đánh dấu tab khác cần tải lại; có khóa gửi lặp, retry, lỗi/empty riêng. Các trang hồ sơ/chuông vẫn dùng API cũ, chưa sửa trong bước này.

Các endpoint mới vẫn chờ xử lý cảnh báo hết hạn bằng transaction hiện có. Chưa chuyển sang job nền hoặc chấp nhận kết quả chưa finalize. Summary/list là các request độc lập, không cam kết snapshot chung khi có quyết định đồng thời; số tổng vẫn exact theo từng query, không dùng ước lượng.

Lab [PERFORMANCE_LAB.md](PERFORMANCE_LAB.md) giữ workload cũ và thêm bootstrap mới trên cùng dataset để đo request/payload/latency. Không lấy test mock làm số đo mạng production. Test tích hợp riêng: `npm run test:moderation:integration --prefix backend` với `MODERATION_TEST_MONGODB_URI` của replica set test được cho phép; tạo/drop đúng DB ngẫu nhiên `moderation_test_<id>`, không đọc `.env` hoặc bootstrap admin.

Ba index StudentWarning candidate phục vụ expiry/admin/student ordering được thử trong lab; ABBA xác nhận query plan nhưng latency còn nhiễu, chưa nghiệm thu throughput hoặc write overhead. Không tự apply/deploy index production.

### Kết quả luồng kiểm duyệt local sau triển khai

Report local `c073105d4c135ef353c9c426.json` dùng cùng database/dataset giữa legacy và API mới: 2.000 user, 400 lớp, 2.000 cảnh báo, mỗi loại học liệu 1.200 bản ghi. MongoDB 7.0.45, 2 CPU/1 GiB RAM, Node v20.20.0. Kết quả dưới đây ở pha index schema; bootstrap gồm 5 mẫu warm/luồng, request đầu ghi riêng.

| Bootstrap trang kiểm duyệt | Legacy tải toàn bộ | Summary + trang warnings đầu |
|---|---:|---:|
| HTTP request | 23 | 2 |
| Body tổng sau giải nén | 2.250.251 byte | 13.504 byte |
| Median local | 540,48 ms | 16,86 ms |
| p95 local | 561,48 ms | 19,00 ms |

Hai luồng khác lượng dữ liệu có chủ đích: bản mới chỉ tải trang/tab đang xem, chưa tải toàn bộ nội dung legacy. Không dùng số này làm cam kết cải thiện production hoặc tốc độ mọi tab. Tab học sinh trang đầu đo riêng median 93,38 ms / p95 135,79 ms (20 mẫu warm); exact total + lookup vẫn phụ thuộc quy mô dữ liệu. Tab lớp median 12,30 ms / p95 14,11 ms.

Không có pending hết hạn trong workload latency; chưa mô phỏng nhiều transaction hết hạn, load đồng thời, CDN/TLS hoặc nén Vercel. Báo cáo hoàn tất, database/client/container test đã được dọn. Test tích hợp MongoDB riêng xác minh nghiệp vụ hết hạn, tổng/danh sách đúng bộ lọc legacy, quyền truy cập và giữ contract API cũ.

Kiểm tra tại thời điểm bàn giao: backend 105/105 test, frontend 19/19 test (6 suites), tích hợp moderation 5/5 (4 kịch bản + test bao ngoài), frontend production build thành công. Các test frontend không thay thế kiểm tra trực quan/trình duyệt và nghiệm thu của chủ dự án. Chưa đủ điều kiện đánh dấu toàn bộ #11 Done.
