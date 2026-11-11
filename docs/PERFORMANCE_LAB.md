# BE #04 giai đoạn 2 — Lab đo baseline an toàn

## Phạm vi được xác nhận

Bước này chỉ bổ sung công cụ đo, fixture giả, test guard và tài liệu. Không đổi API/response, cách xác nhận cảnh báo hết hạn, index production hoặc frontend. Các thay đổi nghiệp vụ/API tiếp theo phải được hỏi và xác nhận riêng.

## Chạy

Yêu cầu: Node.js 20.3+ (môi trường hiện tại dùng 20.20), Docker Desktop Linux engine đã chạy, khoảng 1 GB RAM dành cho container và dependency backend hiện có. Không thêm thư viện npm mới.

```powershell
# Chỉ in kế hoạch, không gọi Docker hoặc database
npm run perf:lab --prefix backend

# Test guard và cách đọc thống kê/EXPLAIN; không cần Docker
npm run test:perf:lab --prefix backend

# Chỉ chạy sau khi được phép: tạo lab local, seed, đo, dọn và ghi báo cáo local
npm run perf:lab --prefix backend -- --run

# Dataset nhỏ để xác minh runner trước khi đo đầy đủ
npm run perf:lab --prefix backend -- --run --users 100 --classes 20 --warnings 40 --items 1 --samples 3

# A/B được xác nhận: index gốc → candidate → candidate → index gốc, cùng DB
npm run perf:lab --prefix backend -- --run --compare-warning-indexes --samples 20
```

Mặc định: 2.000 user giả, 400 lớp, 2.000 cảnh báo, 3 item/mỗi loại học liệu/mỗi lớp, 10 mẫu đo sau request đầu cho từng workload đơn. Bootstrap kiểm duyệt đo tối đa 5 mẫu do gồm nhiều request. Số bản ghi thực tế được ghi trong report.

Giới hạn: user 100–20.000, lớp 20–5.000, cảnh báo 0–20.000, item 1–10, sample 3–50; tích lớp × item không vượt 15.000 để tránh vượt ngân sách lab.

## Cách ly và bảo vệ dữ liệu

- Không đọc `.env`, `MONGODB_URI`, `BENCH_TOKEN`; không nhận URI, token, container hoặc database từ CLI. Không import `backend/server.js`, không chạy bootstrap admin hoặc seed production.
- Mỗi lần chạy tự tạo container `tutoring-perf-<id>` và database `perf_lab_<id>`. ID ngẫu nhiên 24 ký tự hex.
- Port MongoDB bind vào `127.0.0.1`, Docker tự cấp port trống. Replica set chỉ có một node trong container test.
- Image cố định `mongo:7.0.45`; Docker có thể tải image nếu máy chưa có. Container giới hạn 2 CPU, 1 GB RAM, WiredTiger cache 0.25 GB.
- Dữ liệu Mongo nằm trên tmpfs của container, không mount thư mục dự án hoặc volume dữ liệu có sẵn.
- Fixture chỉ chứa dữ liệu giả `example.test`/`example.invalid`. Bulk insert không chạy hook đăng ký/hash mật khẩu; đây không phải benchmark đăng nhập hoặc test đầy đủ tính hợp lệ nghiệp vụ của fixture.
- JWT dùng secret ngẫu nhiên trong bộ nhớ để đi qua middleware xác thực thật và lookup user thật trong DB test. Không log token/secret hoặc đưa vào report. Logging timing được tắt riêng trong tiến trình đo rồi khôi phục cấu hình khi kết thúc.
- Pending warnings có deadline tương lai để GET cảnh báo không chạy xác nhận/chế tài trong baseline. Runner dừng nếu quan sát được command ghi trong request đo.
- Trước khi xóa container, kiểm tra nhãn lab và run ID; trước khi drop database, kiểm tra đúng tên ngẫu nhiên của lần chạy. Không dùng prune hoặc xóa tài nguyên theo pattern rộng.
- Khi kết thúc, đóng HTTP/client, drop đúng DB test và xóa đúng container/anonymous volumes liên quan. Image cache được giữ, không xóa image dùng chung.
- Nếu tiến trình bị kill cưỡng bức, không thể bảo đảm `finally` chạy. Kiểm tra đúng resource name/label trong report hoặc container `tutoring.lab=be04` trước khi dọn thủ công; không xóa container của lần chạy khác.

## Đo cái gì

Lab tạo Express harness dùng router, auth, model, helper và middleware timing hiện có, kết nối MongoDB thật. Không thay handler để làm benchmark nhanh hơn.

Workload gồm:

- Lớp: admin trang đầu, summary, trang sâu khoảng 75% dữ liệu, tìm kiếm contains; danh sách của teacher/student.
- User: admin trang đầu, trang sâu và projection moderation.
- Video/tài liệu/bài tập/thông báo/quiz của lớp mà student có quyền; tổng nội dung overview.
- Cảnh báo của student và danh sách admin (không có pending đã hết hạn).
- Bootstrap kiểm duyệt: đọc đủ các trang lớp lịch sử/user moderation và danh sách cảnh báo, mô phỏng mẫu gọi hiện có của `AdminModeration`.

Mỗi workload có request đầu để ghi nhận riêng, sau đó đo median/p95/min/max, số request và dung lượng body sau giải nén. Request đầu **không được coi là cold start Vercel**: kết nối đã được mở và fixture đã được seed trước đó.

## Hai pha index, không phải before/after code

1. `without_secondary_indexes`: chỉ có index `_id` của collection mới; tắt autoIndex/autoCreate trong harness.
2. `schema_indexes`: tạo đúng các index schema hiện có, trên cùng database/dataset test.

Hai pha chỉ là thí nghiệm tác động của index. Không phải bằng chứng code mới nhanh hơn code cũ, không mô phỏng chắc chắn index production đang có, và không thay thế đo lại baseline sau khi sửa code. Index có thể làm một số thao tác đếm không nhanh hơn; cần đọc kết quả thay vì mặc định pha sau tốt hơn.

## EXPLAIN đúng command thực tế

- Driver `monitorCommands` quan sát command trong request đầu của workload: find, aggregation và cả query count/populate/auth phát sinh.
- Runner chạy lại `explain('executionStats')` trên command đọc đó sau khi đo latency; không dùng một query find mẫu khác để đại diện cho pipeline thật.
- Report chỉ lưu loại command, tên collection, fingerprint, winning stages/indexes, docs/keys examined, thời gian và cờ COLLSCAN/SORT; không lưu raw filter, pipeline, response, tên/email user, token, URI hoặc session metadata.
- Không gom rejected plan vào kết luận winning plan đang COLLSCAN. Với aggregation, thống kê có thể là cursor trước các stage tiếp theo; report ghi rõ scope.
- Capture giới hạn 200 command khác nhau/workload; nếu vượt giới hạn thì `traceTruncated=true`, không được tuyên bố đã bao phủ toàn bộ query.

## Báo cáo và giới hạn

Report JSON được tạo mới (không ghi đè file có sẵn) tại `docs/local/performance/<run-id>.json`, thư mục đã được `.gitignore` loại trừ. Report có source commit, tình trạng thay đổi tracked của application, dataset, hai pha đo và kết quả cleanup. Lần chạy lỗi ghi `status=failed`; không dùng làm bằng chứng nghiệm thu hoàn chỉnh.

Đây là latency local của Express + MongoDB và dữ liệu giả, không phải latency production. Không có TLS, CDN, cold start hoặc nén của Vercel. `contentEncoding=none` ở lab không chứng minh Vercel không nén response. Không lấy body sau giải nén làm số byte truyền trên mạng.

Kết quả chỉ dùng chọn điểm cần tối ưu và baseline cho cùng cấu hình/dataset. Trước khi thay API, polling, xử lý hết hạn hoặc triển khai index thật, phải trình bày kết quả, ảnh hưởng và xin xác nhận của chủ dự án.

## Thử nghiệm index cảnh báo được xác nhận sau baseline

- Baseline local: `13840898f5985100adf38cdb.json` tại `docs/local/performance/`, dữ liệu giả 2.000 user / 400 lớp / 2.000 cảnh báo. Đây là artifact local, không có sẵn khi clone.
- Phạm vi tiếp theo được chốt: chỉ thử ba index `StudentWarning` cho `(status, appealDeadline)`, `(issuedAt descending, _id descending)` và `(student, issuedAt descending, _id descending)`.
- Không xóa index cũ, không đổi API/response/sort hiện tại, không sửa FE hoặc quy tắc xác nhận hết hạn.
- Sau khi sửa schema, lab vẫn chạy hai pha không index phụ / index schema. So sánh pha `schema_indexes` với baseline trước đó chỉ là thí nghiệm schema trên cùng kích thước và cách tạo dữ liệu; ID/ngày giờ là dữ liệu giả mới và điều kiện máy/cache có thể dao động. Đọc query plan cùng latency, không chỉ phần trăm median.
- Chưa apply index hoặc deploy production. Mongoose có thể auto-create index khi ứng dụng được triển khai; cần xin duyệt trước khi push/deploy thay đổi schema, không coi đây là migration đã thực hiện.

### A/B xen kẽ cùng database

Sau hai lượt đo ở database mới khác nhau, chủ dự án xác nhận thêm `--compare-warning-indexes` để giảm nhiễu so sánh. Chế độ này tạo index schema gốc cho mọi model, loại đúng ba candidate ở StudentWarning khi khởi tạo, rồi chạy A1–B1–B2–A2 trên cùng dữ liệu. Chỉ tạo/drop index trong collection `studentwarnings` và database ngẫu nhiên đã kiểm tra quyền sở hữu; không chấp nhận URI/key/tên index tùy ý.

Mỗi pha vẫn bỏ request đầu khỏi thống kê warm, lưu các warm trial không có nội dung response/query/secret để có thể đối chiếu. Các workload không liên quan cảnh báo là đối chứng. Không gộp p95 bằng cách lấy trung bình p95 từng pha. Thứ tự ABBA giảm nhiễu thời gian nhưng không loại hết ảnh hưởng cache/CPU; chưa đo ghi dữ liệu và chưa phải benchmark production hoặc load đồng thời.

### Kết quả local đã quan sát (không phải số đo production)

Report local `b3f436ec95121e745ab9f66c.json` dùng 2.000 user / 400 lớp / 2.000 cảnh báo, 20 mẫu warm cho workload đơn ở mỗi pha và 5 mẫu bootstrap. Kiểm tra index vật lý xác nhận A/B chỉ khác đúng ba candidate. Cleanup database/container thành công.

| Workload | A median / p95 (ms) | B median / p95 (ms) |
|---|---:|---:|
| Cảnh báo student | 16,06 / 22,07 | 13,04 / 25,76 |
| Cảnh báo admin | 373,67 / 591,62 | 333,64 / 528,19 |
| Bootstrap kiểm duyệt | 732,75 / 949,94 | 615,48 / 868,22 |

Thống kê gộp từ mẫu thô: A/B mỗi nhóm có 40 mẫu đơn hoặc 10 mẫu bootstrap. Query plan bỏ COLLSCAN của kiểm tra hết hạn và blocking SORT của hai danh sách cảnh báo trong cả hai pha B; khi quay lại A thì các scan/sort cũ xuất hiện lại.

Đây **không phải cam kết cải thiện latency do index**: đối chứng classes/users cũng nhanh hơn ở pha B, có drift theo thời gian, và p95 student tăng. Chưa đo write overhead hoặc production. Danh sách admin vẫn trả 1.520.616 byte và bootstrap vẫn 23 request / 2.250.251 byte. Cần phân trang/giảm tải dữ liệu để xử lý điểm nghẽn đó; thay đổi API/FE cần xác nhận riêng.

## So sánh snapshot code trước/sau — bổ sung ngày 2026-11-11

```powershell
# Dry-run, không tạo tài nguyên
npm run perf:code:lab --prefix backend
# Chỉ chạy sau khi được phép tạo Docker local/dữ liệu giả
npm run perf:code:lab --prefix backend -- --run --samples 20
# So sánh main c9aca17 với application tracked đang sửa, cùng payload/filter
npm run perf:code:lab --prefix backend -- --candidate --run --classes 5000 --users 5000 --samples 20
# Filter + moderation integration, tự tạo/dọn replica set riêng
npm run test:filters:lab --prefix backend
```

- Runner `performance-code-lab.js` trích đúng các file JS tracked thuộc routes/models/utils/middleware/config của hai Git commit cố định: `f46880307bb769b5a347736bf60c7e3f04d22f4b` (trước BE #04) và `c9aca1771552d8d372bbf2222801c9a16ffc2505` (main sau PR #48). Không checkout/đổi worktree; mỗi snapshot có hash SHA-256 từng file trong report.
- Hai worker Node riêng nạp router thật từ snapshot, dùng dependency backend đang cài qua NODE_PATH. Không import server.js, nạp .env hay bootstrap admin. Đây là so sánh hai revision tổng thể, không chỉ riêng một commit hoặc tác động độc lập của index.
- Cùng database `perf_code_<24hex>`, cùng user/lớp giả và cùng index vật lý của schema main cho cả hai phiên bản. Các candidate warning index không tham gia thí nghiệm này. Không giả định đây là bộ index production trước đây.
- Container `tutoring-code-<24hex>` có nhãn `tutoring.lab=be04-code`/run ID; giới hạn tài nguyên/loopback/tmpfs giống lab cũ. Helper `isolated-mongo.js` chỉ dọn đúng container đã xác minh nhãn và đúng database phát sinh của lần chạy.
- Worker chỉ cho GET hai pathname `/api/classes` và `/api/users` ở HTTP server loopback của chính nó. Runner không nhận URI, token hoặc snapshot tùy ý từ CLI; JWT/secret ngẫu nhiên trong bộ nhớ, log thư viện bị chặn. Quan sát command trong mỗi request và dừng nếu có command không thuộc danh sách đọc; đây không phải sandbox bảo vệ khỏi mã Git độc hại.
- Có request đầu riêng (kèm EXPLAIN ngoài đồng hồ), sau đó các block ABBA tuần tự; số mẫu thực tế là `2 × ceil(samples/2)` mỗi phiên bản. Không chạy đồng thời hai request đo. Report lưu median/p95, byte giải mã, row count, total, command count và digest tập ID, không lưu body/token/raw query.
- Tổng scope trước/sau phải bằng nhau; khi cùng số dòng thì digest ID phải khớp. Classes cũ bỏ qua paging, users cũ có paging khi có limit nhưng không có limit thì unbounded: xem đúng `comparison` và `returnedRows`, không gộp thành một tuyên bố tối ưu query tương đương.
- EXPLAIN bổ sung trên bộ lọc mới chỉ chạy revision sau: subject/grade/status, teacher ID/email, name sort, q và history. Không lấy các query code cũ chưa hỗ trợ để giả làm before/after ngang điều kiện.
- Report nằm ở `docs/local/performance/code-<id>.json`; snapshot tạm được dọn sau khi dừng worker. Kết quả và ngoại lệ scan: [PERFORMANCE_ACCEPTANCE.md](PERFORMANCE_ACCEPTANCE.md).
- `--candidate` giữ before là main `c9aca17`, đọc bản working tree của đúng danh sách application JS tracked tại commit đó cho after. Không nhận revision/path tùy ý; report ghi rõ source working tree và hash từng file, không gọi bản chưa commit là một Git revision mới. Hai phiên bản vẫn chạy trên cùng index vật lý/dataset. Runner so digest toàn bộ JSON đã chuẩn hóa key cho từng workload để bắt sai khác summary, order hoặc projection, không chỉ so số dòng.
- Chế độ candidate bổ sung timing/EXPLAIN q hiếm/rộng/rỗng, summary và history, dùng cùng query ở cả before/after. Lượt 6 mẫu có thể chạy cùng regression để kiểm tra harness nhưng không dùng kết luận latency; lượt chính chạy riêng sau các test/build/browser do agent khởi động đã hoàn tất.
- `test:filters:lab` chạy hai suite MongoDB thật tuần tự, mỗi suite tự tạo/drop database ngẫu nhiên riêng. Không đọc URI ứng dụng; có thể chạy riêng test filter bằng `test:filters:integration` với biến `CLASS_FILTERS_TEST_MONGODB_URI` của replica set test được phép.

## Smoke test Chromium local

Sau khi được cho phép, cài Playwright/Chromium riêng trong thư mục công cụ tạm (không sửa dependency ứng dụng), build frontend rồi chạy:

```powershell
node backend/scripts/browser-smoke.js --tools-dir 'C:\path\to\temporary-playwright-tools'
```

Runner phục vụ production build + router thật trên cùng origin loopback và MongoDB Docker riêng, dùng JWT giả để kiểm tra ba role. Mọi request ra origin khác bị chặn trước khi đi mạng; không dùng tài khoản/secret production. Một ca lỗi 503 được mô phỏng ở lớp transport để kiểm tra retry; các API đọc/review còn lại đi router/MongoDB thật. Screenshot và report ở `docs/local/performance/browser-<id>/`, không phải bằng chứng nghiệm thu trực quan của chủ dự án hay test đăng nhập/production.
