# Công cụ kiểm chứng hiệu năng

Contract và [kết quả nghiệm thu](PERFORMANCE.md#ket-qua) ở [PERFORMANCE.md](PERFORMANCE.md). Các lệnh tạo Docker/ghi dữ liệu chỉ chạy sau khi được phép.

## 1. Yêu cầu và chạy nhanh

Node.js 20.3+, dependency backend hiện có, Docker Desktop Linux engine và khoảng 1 GiB RAM/container. Lab dùng `mongo:7.0.45`, 2 CPU, WiredTiger cache 0,25 GiB.

```powershell
# Không kết nối DB/tạo Docker
npm run perf:indexes --prefix backend
npm run test:perf:lab --prefix backend
npm run perf:lab --prefix backend
npm run perf:code:lab --prefix backend

# Lab index trên router hiện có
npm run perf:lab --prefix backend -- --run
npm run perf:lab --prefix backend -- --run --compare-warning-indexes --samples 20

# So sánh hai snapshot trước/sau BE #04
npm run perf:code:lab --prefix backend -- --run --samples 20

# So main c9aca17 với application tracked trong working tree hiện tại
npm run perf:code:lab --prefix backend -- --candidate --run --classes 5000 --users 5000 --samples 50

# Tự tạo/dọn replica set, chạy filter + moderation integration tuần tự
npm run test:filters:lab --prefix backend
```

Lab index mặc định: 2.000 user / 400 lớp / 2.000 cảnh báo, 3 item mỗi loại học liệu/lớp, 10 mẫu warm/workload; bootstrap tối đa 5 mẫu. Giới hạn CLI: users 100–20.000, classes 20–5.000, warnings 0–20.000, items 1–10, samples 3–50; classes × items không quá 15.000. Code lab chỉ seed user/lớp, ghi warnings 0 / items 1.

## 2. Chọn đúng phép so sánh

| Công cụ/chế độ | Thay đổi giữa các pha | Không được suy ra |
|---|---|---|
| `perf:lab` | Không index phụ → index schema, cùng code/DB | Before/after code hoặc index production cũ |
| `--compare-warning-indexes` | A1–B1–B2–A2, chỉ bật/tắt ba warning index | Latency do riêng index, throughput ghi |
| `perf:code:lab` | Snapshot `f468803` → `c9aca17`, cùng DB/index | Cùng lượng dữ liệu nếu code cũ bỏ qua paging |
| `perf:code:lab --candidate` | `c9aca17` → file tracked hiện tại, cùng query/DB/index | Candidate là Git revision mới hoặc đã deploy |

Ba warning index candidate: `(status, appealDeadline)`, `(issuedAt desc, _id desc)`, `(student, issuedAt desc, _id desc)`. Các index khác giữ nguyên; không nhận tên/key index tùy ý.

Code lab trích JS thuộc routes/models/utils/middleware/config từ commit cố định `f46880307bb769b5a347736bf60c7e3f04d22f4b` và `c9aca1771552d8d372bbf2222801c9a16ffc2505`. Hai worker dùng router thật và dependency backend qua NODE_PATH; report lưu SHA-256 từng file. Candidate đọc đúng danh sách file tracked của baseline, lưu hash working tree và so digest toàn bộ JSON response chuẩn hóa, gồm summary/order/projection.

Workload bao phủ lớp theo role/trang/filter, users, học liệu/overview, cảnh báo và bootstrap kiểm duyệt tùy runner. Candidate thêm q hiếm/rộng/rỗng, summary và history. Classes legacy bỏ qua paging; users legacy có paging khi có limit nhưng mặc định unbounded: phải đọc `returnedRows`/`comparison`.

## 3. Cách ly và cleanup

- Không nạp `.env`, URI/token ứng dụng hoặc server.js/bootstrap admin; runner không nhận URI, secret, database/container tùy ý qua CLI. JWT/secret ngẫu nhiên nằm trong bộ nhớ; fixture chỉ `example.test`/`example.invalid`, không phải test đăng ký/hash mật khẩu.
- MongoDB bind loopback, dữ liệu trên tmpfs, không mount dữ liệu dự án. Pending warnings có deadline tương lai trong benchmark đọc; dừng nếu quan sát command ghi. Worker code lab chỉ cho GET `/api/classes` và `/api/users` ở server của chính nó, không phải sandbox chống mã Git độc hại.
- Lab index tạo `tutoring-perf-<24hex>` / `perf_lab_<24hex>`, nhãn `tutoring.lab=be04`. Code/browser/integration lab tạo `tutoring-code-<24hex>` / `perf_code_<24hex>`, nhãn `tutoring.lab=be04-code`. Cả hai có nhãn run ID.
- Trước cleanup kiểm tra đúng tên DB và nhãn lab/run; đóng HTTP/client, drop đúng DB, xóa đúng container/anonymous volume, dọn snapshot tạm. Không prune hoặc xóa image dùng chung.
- Kill cưỡng bức/restart có thể bỏ qua finally: kiểm tra đúng resource/nhãn của lượt gián đoạn trước khi dọn thủ công. Không dùng report lỗi hoặc cleanup chưa hoàn tất để nghiệm thu.
- Test filter/moderation tự tạo/drop DB ngẫu nhiên riêng. Chạy riêng bằng `test:filters:integration` / `test:moderation:integration` cần `CLASS_FILTERS_TEST_MONGODB_URI` / `MODERATION_TEST_MONGODB_URI` của replica set test được phép; không dùng URI production.

## 4. Đọc report và EXPLAIN

- Report/screenshot ở `docs/local/performance/`, bị ignore và không có sẵn khi clone; file mới không ghi đè report cũ. Giữ `status`, provenance, dataset/indexes và cleanup cùng số đo.
- Tách request đầu khỏi mẫu warm; request đầu không phải cold start Vercel vì DB đã kết nối/seed. Code lab đo block ABBA tuần tự, `2 × ceil(samples/2)` mẫu mỗi revision; không chạy benchmark chính cùng build/test/browser.
- Đo median/p95/min/max, số request/command, byte **sau giải nén** và số dòng. Lab không có TLS/CDN/nén Vercel hoặc concurrent load; `contentEncoding=none` không chứng minh deployment không nén.
- Driver quan sát command find/aggregate thực tế, gồm auth/count/populate; EXPLAIN executionStats chạy ngoài đồng hồ HTTP. Report không lưu raw query/body/token/URI hoặc hồ sơ user.
- Chỉ phân tích winning plan/execution, không gom rejected COLLSCAN/SORT. Aggregation stats có thể chỉ là cursor trước stage cuối; đọc `statisticsScope`. Capture giới hạn 200 command khác nhau; nếu truncated thì không tuyên bố bao phủ toàn bộ.
- ABBA giảm drift nhưng không loại hết CPU/cache noise. Không lấy trung bình các p95 để tạo p95 gộp; đọc mẫu thô và control endpoint. Không suy ra SLA hoặc write overhead từ benchmark đọc local.

## 5. Browser và benchmark HTTP riêng

Sau khi được phép cài Playwright/Chromium vào thư mục công cụ tạm (không thêm dependency ứng dụng), build frontend rồi chạy:

```powershell
node backend/scripts/browser-smoke.js --tools-dir 'C:\path\to\temporary-playwright-tools'
```

Runner dùng production build, router/MongoDB thật và JWT giả trên origin loopback; chặn mạng ngoài trước khi gửi request. Bao phủ ba role, desktop/mobile, paging/filter/tab/retry/review. Ca retry mô phỏng transport 503; không phải test login, thiết bị vật lý hoặc production.

Nếu benchmark một server test có sẵn, `perf:benchmark` nhận `BENCH_BASE_URL`, `BENCH_TOKEN`, `BENCH_SAMPLES`, `BENCH_LABEL` qua môi trường. Chỉ GET classes/users, cần tài khoản admin thử nghiệm; không đưa token vào command line/log/report chia sẻ. Các lệnh `perf:indexes -- --apply` / `--explain` dùng MONGODB_URI và chỉ được chạy trên DB đã được cho phép; createIndexes không đồng nghĩa quyền apply production.
