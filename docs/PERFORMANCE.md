# BE #04 — Hiệu năng API và frontend

[Issue #11](https://github.com/ThanhVu6102/tutoring-platform/issues/11) đã **CLOSED / Done** theo xác nhận nghiệm thu của chủ dự án ngày 2026-11-11. Gói tối ưu cuối `32e6ff8` đã merge vào `develop` qua [PR #50](https://github.com/ThanhVu6102/tutoring-platform/pull/50); không đồng nghĩa đã phát hành gói đó lên `main`.

Cách chạy công cụ: [PERFORMANCE_LAB.md](PERFORMANCE_LAB.md). Contract kiểm duyệt: [APPEALS.md](APPEALS.md#kiem-duyet). Số đo/nghiệm thu nằm ở [cuối trang](#ket-qua).

## 1. Contract phân trang

Bảy danh sách luôn trả object, kể cả khi không truyền page/limit:

| Nhóm | GET endpoint |
|---|---|
| Lớp | `/api/classes` |
| User, chỉ admin | `/api/users` |
| Học liệu | `/api/{videos,documents,assignments,announcements,quizzes}/class/:classId` |

```json
{ "data": [], "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
```

- Mặc định page 1 / limit 20; trần page 10.000 / limit 100. Số nguyên dương vượt trần được cap, tham số sai trả `400`.
- Count và trang dùng cùng filter quyền; học sinh chỉ thấy lớp active đã tham gia và quiz published. Sort có `_id` làm khóa phụ.
- Tổng chính xác theo query, không phải snapshot chung khi dữ liệu thay đổi giữa các query/trang.
- Client cũ nhận mảng phải cập nhật cùng backend. Các API cảnh báo legacy, roster, yêu cầu tham gia và bài nộp không tự chuyển sang contract này.

## 2. Truy vấn và bộ lọc

| Nhóm | Cách giảm tải |
|---|---|
| Lớp | Aggregation tính `studentCount`/`joinRequestCount`, không populate roster; populate teacher theo lô |
| Quiz | Chỉ metadata, `questionCount`/`hasPromptImage`; không tải câu hỏi, đáp án hoặc ảnh đề cho thẻ |
| Học liệu khác | Projection + lean, bỏ lịch sử xem/tải, bài nộp và read receipts khỏi danh sách |
| User | Giữ [allowlist hồ sơ](USER_PRIVACY.md); `view=moderation` bỏ avatar/hồ sơ nặng |
| Tổng học liệu | `/api/classes/:id/content-summary` kiểm tra quyền lớp; chỉ đếm quiz published cho student |

`GET /api/classes` giữ `search` theo tên, filter `subject`/`grade`/`status`. Admin có thêm:

- `q`: contains tên/mô tả, escape regex, không phân biệt hoa thường.
- `teacher`: ObjectId hoặc email chính xác, chuẩn hóa query email về chữ thường.
- `sort`: `newest`, `oldest`, `name_asc`, `name_desc`; ngoài allowlist trả `400`.
- `summary=true`: total/active/inactive trên toàn bộ filter, không phải length trang.

Contract FE/BE #01: `search` là tham số cũ chỉ tìm trong tên; admin dùng `q` để tìm trong cả tên và mô tả. Nếu gửi cả hai, `q` được ưu tiên. `subject` và `grade` khớp giá trị chính xác; `teacher` nhận ObjectId hoặc email chính xác (không tìm gần đúng); `status` nhận `active`/`inactive`; `sort` sai allowlist trả `400`. Trang `/admin` lưu `q`, `subject`, `grade`, `status`, `teacher`, `sort` trên URL để tải lại và quay từ chi tiết lớp vẫn giữ bộ lọc. Nút **Xóa bộ lọc** xóa các tham số đó; thay đổi bộ lọc đặt phân trang về trang đầu. Mỗi request danh sách vẫn dùng `page`/`limit` và quyền từ database như trước.

Kiểm tra `explain('executionStats')` trên MongoDB replica set QA riêng với 1.200 lớp giả: lọc teacher + mới nhất dùng `teacher_1_createdAt_-1__id_-1`, lọc subject/grade + mới nhất dùng `subject_1_grade_1_createdAt_-1__id_-1`, sắp xếp tên dùng `name_1__id_1` (mỗi ca đọc 20 key/document cho 20 kết quả đầu). Bộ dữ liệu/DB tạm đã được xóa sau phép đo. Tìm `q` kiểu contains không đảm bảo dùng index tìm kiếm; planner có thể quét nhiều key/document khi dữ liệu lớn. Đây là giới hạn hiện có, không phải kết quả hiệu năng production.

Các query không mở rộng quyền role khác; student không được dùng status để xem lớp inactive. `view=history` lọc hồ sơ/lịch sử cho quản lý lớp; `view=notifications` lấy thông báo xử lý liên quan.

Tối ưu cuối: count lớp không filter dùng index `_id_`; contains/history có admin summary gộp ba count thành group theo status, query trang vẫn chạy song song. Bản ghi status cũ/thiếu vẫn góp vào total. Không dùng estimated count hoặc facet gom payload trang lớn.

## 3. Kết nối, HTTP và index

- Cache promise kết nối MongoDB trong **mỗi instance**; lỗi kết nối được thử lại. Không chia sẻ connection giữa các instance serverless; không tự tạo/khôi phục admin khi kết nối lại. Tạo admin ban đầu bằng [thao tác thủ công](ADMIN_BOOTSTRAP.md).
- `Server-Timing: app;dur=...` đo đến lúc ghi header, không phải toàn bộ thời gian tải mạng/body. `PERF_LOG_ENABLED=true` bật log method/mẫu route/status/duration, không log ID/query/body/token/URI.
- API riêng tư dùng `Cache-Control: private, no-store`; `/api/docs` công khai cache 300 giây. Brotli đã quan sát trên `/api/docs`, không suy ra mọi response riêng tư đều nén; xem phạm vi kiểm chứng trong báo cáo nghiệm thu.
- Index schema phục vụ sort/filter lớp, user, học liệu, quiz submissions và cảnh báo. Script `perf:indexes` xem định nghĩa; `--apply` dùng createIndexes, không sync/drop index ngoài schema. Chỉ apply trên DB được phép; Mongoose autoIndex cũng có thể tạo index khi khởi động.
- Contains có thể còn COLLSCAN; exact count vẫn tăng theo số key/document. Offset trang sâu vẫn tốn chi phí. Không ép hint hoặc đổi semantics tìm kiếm chỉ để làm đẹp EXPLAIN.

## 4. Frontend và giới hạn giữ nguyên

- Dashboard/admin tải theo trang; tìm kiếm debounce, giữ dữ liệu cũ khi refetch, bỏ response stale. GET trùng URL/tham số/token đang chạy được gộp, không cache kết quả lâu dài giữa tài khoản.
- Chi tiết lớp lấy tổng riêng và chỉ tải học liệu khi mở tab; giữ tab đã tải đến khi cần invalidation. Route nặng dùng `React.lazy`/`Suspense`.
- Kiểm duyệt mở summary + warnings trang đầu, tab khác tải theo nhu cầu. Hồ sơ/chuông giáo viên còn có luồng `getAllPages`; tổng lượng đọc vẫn tăng theo lịch sử.
- Giữ polling 30 giây và transaction finalize cảnh báo hết hạn; chưa có job nền/WebSocket/cache liên phiên. Backlog expiry lớn và write overhead chưa được benchmark.
- Chưa có API reference môn/khối/vai trò riêng để cần thêm cache; không tạo cache giả cho checklist.

Nghiệm thu mức tối ưu hiện tại không phải cam kết SLA production, không xác nhận mọi query tránh scan và không tự mở rộng phạm vi [issue #12](https://github.com/ThanhVu6102/tutoring-platform/issues/12).

<a id="ket-qua"></a>
## 5. Số đo và nghiệm thu

Chủ dự án đã [nghiệm thu mức tối ưu hiện tại](https://github.com/ThanhVu6102/tutoring-platform/issues/11#issuecomment-6798915213). Các kết quả sau đã chạy trên source được nêu, **không phải kiểm thử mới khi sửa tài liệu**. Report/screenshot thô ở `docs/local/performance/` bị ignore, không có sẵn khi clone; DB/container/snapshot của lượt hoàn tất đã dọn.

### Code trước/sau BE #04

Before `f46880307bb769b5a347736bf60c7e3f04d22f4b` (cha `925022f`) → after `c9aca1771552d8d372bbf2222801c9a16ffc2505` (main sau PR #48). Hai worker dùng snapshot Git chính xác, cùng DB giả **2.000 user / 400 lớp**, cùng index vật lý schema main, không tắt xác thực/quyền.

Report `code-ad9bb1a404b6bba05bdf93db.json`: MongoDB 7.0.45, 2 CPU / 1 GiB, Node v20.20.0, Express loopback/identity encoding, **20 mẫu warm ABBA mỗi phiên bản**; tách request đầu, EXPLAIN ngoài đồng hồ, không chạy cùng build/test/browser khác do agent khởi động.

| GET / trường hợp | Dòng trước → sau | Byte giải mã trước → sau | Trung vị ms trước → sau | p95 ms trước → sau |
|---|---:|---:|---:|---:|
| classes admin trang 1, limit 20 | 400 → 20 | 1.190.684 → 11.930 | 388,62 → 23,12 | 540,14 → 52,41 |
| classes teacher trang 1, limit 20 | 20 → 20 | 43.700 → 11.955 | 98,20 → 40,40 | 237,59 → 92,70 |
| classes student trang 1, limit 20 | 4 → 4 | 4.457 → 1.623 | 19,56 → 19,41 | 27,57 → 21,89 |
| users admin trang 1, limit 20 | 20 → 20 | 37.399 → 36.999 | 21,84 → 15,33 | 28,32 → 18,96 |
| users admin trang 75, limit 20 | 20 → 20 | 38.919 → 38.519 | 26,61 → 21,51 | 140,69 → 43,32 |
| users admin không limit | 2.000 → 20 | 3.794.910 → 36.999 | 302,92 → 15,45 | 349,98 → 17,26 |

Classes cũ bỏ qua paging; users cũ có paging khi truyền limit nhưng mặc định tải toàn bộ. Hàng giảm số dòng đo lợi ích giới hạn payload có chủ đích, không phải cùng lượng nội dung. Tổng phạm vi khớp, dấu kiểm tập ID khớp khi cùng số dòng; student gần như không đổi trung vị và thêm một command count (3 → 4), users cùng trang vẫn 3 command/query plan tương tự. Không gán mọi chênh lệch cho index hoặc N+1.

### Tối ưu cuối so với main c9aca17

Report `code-c75e249f5b057154afdad6da.json`: **5.000 user / 5.000 lớp / 50 mẫu warm ABBA mỗi phiên bản**, cùng cấu hình DB/index như trên. Bản sau là working tree đã băm trước commit `32e6ff8`; toàn bộ JSON response chuẩn hóa trước/sau khớp, hash file được đối chiếu sau đo. Chỉ sửa cách count ở pagination/classes, giữ API/quyền/contains/exact total/sort.

| Trường hợp | Trung vị ms main → mới | p95 ms main → mới | Command main → mới | Document classes xét main → mới |
|---|---:|---:|---:|---:|
| Admin trang 1 không filter | 16,57 → 14,09 | 24,16 → 21,20 | 4 → 4 | 5.020 → 20 |
| q rộng + summary | 24,31 → 23,93 | 29,69 → 30,45 | 6 → 4 | 10.020 → 5.020 |
| q rộng + history + summary | 23,39 → 22,44 | 27,09 → 25,03 | 6 → 4 | 10.066 → 5.066 |

Document xét là tổng plan classes trong request đầu, không gồm user xác thực/populate; command là toàn request. Count `_id_` xét 5.001 key và **0 document**, trang đọc 20 document; exact count không phải O(1). q + summary vẫn một COLLSCAN 5.000 document nhưng bỏ hai count status riêng. Đây là giảm công việc DB, **chưa chứng minh tìm kiếm nhanh hơn đáng kể**: p95 q + summary tăng nhẹ; các endpoint đối chứng không đổi cũng có dao động.

### Kiểm duyệt, bundle và index

| Bằng chứng local | Kết quả và cách đọc |
|---|---|
| Bootstrap kiểm duyệt `c073105d4c135ef353c9c426.json` | 2.000 user / 400 lớp / 2.000 warnings, 1.200 bản ghi mỗi loại học liệu, pha index schema, 5 mẫu warm/luồng. Legacy → summary + trang đầu: **23 → 2 request**, **2.250.251 → 13.504 byte**, trung vị **540,48 → 16,86 ms**, p95 **561,48 → 19,00 ms**. Không cùng lượng nội dung; chưa có pending hết hạn trong workload latency. Tab student trung vị/p95 93,38/135,79 ms (20 mẫu), class 12,30/14,11 ms. |
| Bundle | Initial JS gzip ngày 2026-11-03 **94,16 → 80,36 kB**; build frontend c9aca17 ngày 2026-11-11 **80,83 kB**. Overview chuyển từ chi tiết + 5 danh sách sang chi tiết + tổng. Không suy ra nén HTTP hoặc tổng dung lượng mọi route. |
| EXPLAIN | Index lớp theo ngày/teacher/student, subject+grade, name asc/desc; email `email_1`, users theo deletedAt. Users trang 75 vẫn xét 1.500 document do offset. Thống kê aggregation có thể chỉ ở cursor trước bước cuối. |
| Warning index ABBA `b3f436ec95121e745ab9f66c.json` | 2.000 user / 400 lớp / 2.000 warnings, A/B mỗi nhóm 40 mẫu đơn hoặc 10 bootstrap. B bỏ expiry COLLSCAN và list blocking SORT; trung vị/p95 ms: student **16,06/22,07 → 13,04/25,76**, admin **373,67/591,62 → 333,64/528,19**, bootstrap **732,75/949,94 → 615,48/868,22**. Đối chứng cũng nhanh hơn nên chưa quy toàn bộ lợi ích cho index. Baseline: `13840898f5985100adf38cdb.json`. |
| Phương án loại bỏ `code-73fc5298efe8607be287cc81.json` | Facet ID/count rồi đọc trang tuần tự chậm hơn main trên 5.000 lớp: q rộng 16,75 → 22,82 ms, q + summary 18,40 → 27,76 ms, history 16,11 → 24,81 ms. Không giữ chỉ để bỏ nhãn COLLSCAN; không gom payload lớn vào facet vì giới hạn BSON 16 MiB. |

### Kiểm thử và giới hạn nghiệm thu

- Source backend cuối: **111/111** unit/HTTP; **15/15** MongoDB integration (13 kịch bản + 2 test bao ngoài), gồm filter/sort/quyền giả mạo, summary chính xác, trang rỗng/vượt cuối, status legacy, contract cũ, transaction expiry, query count/trang song song và trang thumbnail tổng 20 MiB.
- Frontend c9aca17: **31/31**, 10 suites, build thành công; không sửa source frontend trong bước tối ưu cuối. Không tự coi kết quả này đại diện toàn bộ develop sau khi tích hợp FE khác.
- Chromium cuối **27/27**, report `browser-55419c7fd0c5e487b88a98c7/report.json`: ba role, 1440×1000 / 390×844, paging/filter/empty/reset/retry, tab tải theo nhu cầu, review single-submit + làm mới tổng, lazy học liệu, admin guard, menu mobile không tràn ngang/page crash. JWT/data giả local, chặn mạng ngoài; chỉ ca 503 là transport mock, không phải test login/thiết bị vật lý/production. Không dùng lượt lỗi hoặc bị restart làm bằng chứng.
- Deployment main c9aca17: `/api/docs` HTTP 200, `Content-Encoding: br`, cache public 300 giây; **chưa xác minh nén mọi payload riêng tư có auth**. Chưa đo tải đồng thời, tồn đọng expiry lớn, chi phí ghi, TLS/CDN/cold start; không apply index/seed production trong lab.
- Contains vẫn có thể scan toàn tập; exact count/deep offset vẫn tăng chi phí theo dữ liệu. Index tìm kiếm chuyên dụng, field dẫn xuất/backfill hoặc dịch vụ search cần duyệt riêng; không tự đổi sang prefix/full-text/count ước lượng. Done của #11 không có nghĩa các phần này đã triển khai.
