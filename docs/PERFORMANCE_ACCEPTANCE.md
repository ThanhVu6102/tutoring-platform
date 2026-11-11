# BE #04 — Bằng chứng bổ sung ngày 2026-11-11

Issue [#11](https://github.com/ThanhVu6102/tutoring-platform/issues/11), liên quan [#12](https://github.com/ThanhVu6102/tutoring-platform/issues/12). Giữ **OPEN / In progress** cho đến khi chủ dự án nghiệm thu. Chủ dự án đã cho phép commit/push gói test/công cụ/tài liệu và tối ưu bổ sung lên `perf/api-loading`; chưa cho phép PR/merge/phát hành trong bước này. Mục 1–6 ghi baseline main `c9aca17`; tối ưu sau khi chủ dự án yêu cầu tiếp tục nằm ở mục 7.

## 1. Code và điều kiện đo

- Before: `f46880307bb769b5a347736bf60c7e3f04d22f4b`, cha của commit BE #04 đầu tiên `925022f`.
- After: `c9aca1771552d8d372bbf2222801c9a16ffc2505`, main sau PR #48, gồm FE và bộ lọc mới đã merge.
- Snapshot Git chính xác, worker process riêng; không sửa handler hoặc tắt xác thực/quyền. Cùng một DB giả 2.000 user / 400 lớp, cùng index vật lý schema main. Không đo lợi ích riêng của index hoặc giả định index production cũ.
- MongoDB `7.0.45`, container 2 CPU / 1 GiB, Node `v20.20.0`; Express loopback, identity encoding, không TLS/CDN/Vercel. Sau request đầu riêng, 20 mẫu warm/phiên bản theo block ABBA tuần tự. EXPLAIN ở ngoài đồng hồ HTTP.
- Report chính: `docs/local/performance/code-ad9bb1a404b6bba05bdf93db.json`, hoàn tất và đã dọn DB/container/snapshot. Report local bị ignore có chủ đích, không có sẵn khi clone. Lượt thử 6 mẫu `code-682c842ddc78ee3dd16ddfa3.json` chỉ dùng xác minh runner; bảng dưới dùng lượt 20 mẫu, không chạy cùng build/test/browser khác do agent khởi động.

## 2. Before/after thật, phân biệt lượng dữ liệu

Byte là body đã giải mã, không phải byte truyền mạng. ID digest khớp khi số dòng trước/sau bằng nhau; tổng scope khớp cho mọi workload.

| GET / workload | Dòng trước → sau | Byte trước → sau | Median ms trước → sau | p95 ms trước → sau |
|---|---:|---:|---:|---:|
| classes admin `page=1&limit=20` | 400 → 20 | 1.190.684 → 11.930 | 388,62 → 23,12 | 540,14 → 52,41 |
| classes teacher `page=1&limit=20` | 20 → 20 | 43.700 → 11.955 | 98,20 → 40,40 | 237,59 → 92,70 |
| classes student `page=1&limit=20` | 4 → 4 | 4.457 → 1.623 | 19,56 → 19,41 | 27,57 → 21,89 |
| users admin `page=1&limit=20` | 20 → 20 | 37.399 → 36.999 | 21,84 → 15,33 | 28,32 → 18,96 |
| users admin `page=75&limit=20` | 20 → 20 | 38.919 → 38.519 | 26,61 → 21,51 | 140,69 → 43,32 |
| users admin không truyền limit | 2.000 → 20 | 3.794.910 → 36.999 | 302,92 → 15,45 | 349,98 → 17,26 |

**Cách đọc:** classes cũ bỏ qua page/limit; users cũ đã có paging khi truyền limit nhưng mặc định còn tải toàn bộ. Hai hàng giảm số dòng chứng minh lợi ích giới hạn payload có chủ đích, không phải cùng lượng dữ liệu được xử lý nhanh hơn. Teacher/student ở dataset này có cùng số dòng, cho thấy ảnh hưởng projection/bỏ roster; riêng student median gần như không đổi và phát sinh thêm một command count (3 → 4). Users cùng trang vẫn 3 command, query plan tương tự; không gán toàn bộ chênh lệch timing cho index hay tuyên bố loại N+1 ở endpoint này. Lặp lại trên máy/data khác có thể cho timing khác, nhất là p95; không suy ra SLA production.

## 3. Query plan: đã dùng index và ngoại lệ còn lại

EXPLAIN dùng command thực tế quan sát trong router; report chỉ lưu thống kê winning plan, không raw query/response/token. Với aggregation, `nReturned` ở cursor có thể trước stage tính count, không phải số dòng response cuối.

- Trang lớp admin theo ngày: `createdAt_-1__id_-1`, xét 20 document cho trang 20 dòng, không blocking SORT. Theo teacher: `teacher_1_createdAt_-1__id_-1`; student: `students_1_status_1_createdAt_-1__id_-1`.
- Name asc/desc: `name_1__id_1`, không blocking SORT. Subject Math + grade 10 + active: `subject_1_grade_1_createdAt_-1__id_-1`, xét 25 document để trả 20; total exact 107.
- Teacher email lookup: `email_1`, sau đó index teacher; total exact 20 cho cả ID/email.
- Users trang đầu dùng `deletedAt_1_createdAt_-1__id_-1`; count dùng COUNT_SCAN, không COLLSCAN. Trang 75 vẫn xét 1.500 document do skip: phân trang offset không loại chi phí trang sâu.
- **Ngoại lệ 1:** count toàn bộ classes không filter vẫn COLLSCAN 400 document, dù truy vấn trang dùng index. Exact totals được giữ, chưa đổi sang estimated count/cache hoặc ép hint để chỉ làm đẹp checklist.
- **Ngoại lệ 2:** q contains và q + history có count COLLSCAN; truy vấn trang có thể dùng index sort nhưng vẫn xét cả 400 document để tìm chuỗi. B-tree không bảo đảm tăng tốc contains không phân biệt hoa thường; chưa đổi contract sang prefix/full-text hoặc thêm dịch vụ search.
- Status inactive + summary dùng `status_1` cho count; trang vẫn có thể xét nhiều key/document để giữ sort ngày. Không tuyên bố mọi tổ hợp filter đều có index bao phủ.
- Thử nghiệm warning index và học liệu trước đó xem [PERFORMANCE_LAB.md](PERFORMANCE_LAB.md). Chưa đo write overhead, backlog expiry lớn hoặc tải đồng thời; không apply script index/seed lên production trong gói này.

Do còn các ngoại lệ trên, tiêu chí gốc “no collection scans on growing collections” **chưa đạt tuyệt đối**. Cần chủ dự án chốt chấp nhận ngoại lệ exact-count/contains có tài liệu, hoặc duyệt một bước tối ưu riêng; không âm thầm nới tiêu chí.

## 4. Kiểm thử chạy lại trên main mới nhất

| Kiểm tra | Kết quả |
|---|---|
| Backend unit/HTTP, gồm guard snapshot runner mới | 108/108 đạt |
| Frontend | 31/31 đạt, 10 suites |
| Frontend production build | Thành công, initial JS gzip 80,83 kB |
| MongoDB filter + moderation integration | 13/13 đạt: 11 kịch bản + 2 test bao ngoài |

`classFilters.integration.test.js` kiểm tra name/description q và escape literal; subject/grade/status; teacher ID/email chuẩn hóa; bốn sort và tie `_id`; invalid sort; nhiều trang/exact total/summary; rỗng; history kết hợp q; student/teacher không vượt scope kể cả JWT giả role admin. Dùng ID kỳ vọng từ fixture, không kiểm tra membership qua roster đã bị loại khỏi response. Email chỉ `example.test`.

Suite moderation chạy lại trên MongoDB thật xác nhận parity tổng/danh sách với quy tắc legacy, paging/status/quyền, giữ contract API cũ và finalize cảnh báo hết hạn qua transaction. Mỗi suite có DB ngẫu nhiên riêng; container/DB đã dọn thành công.

## 5. Browser và deployment

- Chromium production-build local, viewport desktop 1440×1000 / mobile 390×844, cả admin/teacher/student. Lượt cuối `browser-a8c628b8fb01dc9b0965ccfe` đạt **27/27 kiểm tra**: dashboard nhiều trang; admin filter/empty/reset; mô phỏng HTTP 503 rồi retry; moderation chỉ gọi summary + warnings khi mở, chuyển tab; review hai sự kiện liên tiếp chỉ gửi một PATCH và tải lại summary; overview không tải năm danh sách học liệu, mở Video mới gọi video; redirect role thường khỏi admin; menu mobile, không tràn ngang hoặc page crash. Database/container được dọn thành công.
- Mạng ngoài bị chặn; auth bằng JWT test trên user thật trong MongoDB giả. Không phải test login, kiểm tra thiết bị vật lý hay test trên Preview/production. Một ca retry có transport giả 503; không thay router/data cho những luồng còn lại.
- Screenshot/report chỉ ở `docs/local/performance/browser-<id>/`. Lượt đầu lỗi selector test (`browser-e5b4c2054810e4b5baf2daba`) đã sửa trong harness, không sửa UI để test qua; lượt 26 ca (`browser-a946143020327e17f5c0c599`) được thay bằng lượt cuối ở trên. Không dùng lượt lỗi làm bằng chứng nghiệm thu.
- Read-only deployment main `c9aca17`: `/api/docs` HTTP 200, `Content-Encoding: br`, `Cache-Control: public, max-age=300`. Đã có nén Brotli từ nền tảng; chưa cần thêm dependency chỉ để có tên middleware.
- Chưa xác minh header nén cho payload lớn có xác thực trên deployment test riêng. Không lấy header `/api/docs` để khẳng định mọi API riêng tư đều nén. Không dùng user/admin production cho smoke test.

## 6. Chốt nghiệm thu, không tự Done

- [x] Có benchmark code cũ/mới classes/users, cùng dữ liệu/index, phân biệt cùng số dòng với paging.
- [x] Có EXPLAIN route thật và liệt kê minh bạch các scan/deep-offset còn lại.
- [x] Filter/sort đã có trên main và có MongoDB integration; FE desktop/mobile đã có smoke bằng dữ liệu giả.
- [x] Regression/build và integration mới đạt; không thay API/quyền/transaction/production data trong gói kiểm chứng.
- [ ] Chủ dự án chốt ngoại lệ exact count / contains so với yêu cầu gốc không COLLSCAN, hoặc duyệt bước tối ưu tiếp theo.
- [ ] Nghiệm thu trực quan FE và xác minh compression API riêng tư trên môi trường deployment test riêng (hoặc chốt phạm vi bằng chứng nền tảng hiện có).
- [x] Chủ dự án cho phép commit/push gói kiểm chứng và tối ưu lên branch `perf/api-loading`.
- [ ] Cho phép PR/merge/phát hành, sau đó quyết định trạng thái issue; không tự đóng chỉ vì merge.

## 7. Tối ưu bổ sung sau yêu cầu “tiếp tục tối ưu”

Chỉ sửa `backend/utils/pagination.js` và chỗ gọi của `backend/routes/classes.js`, giữ nguyên contract, quyền, contains regex, sort và exact total; không thêm dependency, index, migration hoặc dịch vụ search.

- Filter lớp rỗng: hint `_id_` cho exact count nhằm đếm key thay vì đọc toàn bộ document. Không dùng estimated count, không nhận hint từ client và không ép hint này cho filter khác.
- **Phương án thử đã loại bỏ:** facet gom ID/count rồi đọc nội dung trang tuần tự. Report `code-73fc5298efe8607be287cc81.json` trên 5.000 user / 5.000 lớp / 20 mẫu cho thấy q broad median 16,75 → 22,82 ms, q + summary 18,40 → 27,76 ms, history 16,11 → 24,81 ms. Dù số document xét giảm ở một số query, có thêm đọc tuần tự và bounded blocking sort; không giữ phương án chậm hơn chỉ vì hết nhãn COLLSCAN. Biến thể facet gom cả payload cũng không giữ vì giới hạn BSON 16 MiB.
- **Candidate thay thế:** giữ query trang như main chạy song song với query đếm. Chỉ gộp ba count total/active/inactive thành một group khi admin yêu cầu summary cùng contains/history. Request không yêu cầu summary không bị đổi sang facet hoặc thêm lượt đọc nội dung.
- Trang vượt cuối/rỗng vẫn nhận exact total và summary; query group không chứa nội dung trang/ảnh lớn. Trang và count là các query độc lập, không cam kết snapshot chung khi dữ liệu thay đổi giữa hai lần đọc, như cơ chế main trước đó.
- Không suy từ việc hết nhãn COLLSCAN ra chi phí dưới tuyến tính: contains và exact total vẫn có thể phải xét toàn bộ tập. Đánh giá thêm documents/keys examined và thời gian so với main cùng JSON response.
- Runner `--candidate` so sánh snapshot main với file application tracked của working tree; lưu hash toàn bộ file và digest JSON chuẩn hóa. Không gọi candidate chưa commit là một revision phát hành.
- Một lượt browser bị hủy bởi server/máy khởi động lại (`browser-1696f0d0ab6f280395af3ff2`), không dùng làm bằng chứng. Container đã dừng được xác minh đúng hai nhãn run/lab rồi xóa đúng tên, không prune. Lượt chạy lại và số đo cuối được ghi sau khi hoàn tất.

### Kiểm tra phương án facet trước khi loại bỏ

- Backend **111/111** đạt cho phương án facet thử nghiệm, chưa thay kết quả chạy lại cho candidate thay thế.
- MongoDB filter + moderation **15/15** đạt (13 kịch bản + 2 test bao ngoài). Hai ca mới xác nhận exact total/summary trên trang vượt cuối và trang 10 thumbnail × 2 MiB vẫn trả được thay vì chạm giới hạn BSON 16 MiB. Container/DB đã dọn.
- Chromium **27/27** trên phương án facet thử nghiệm, report `browser-67e8f3f2b4d04cc9659783eb/report.json`, cleanup thành công. Lượt này không thay smoke cho candidate thay thế.
- Frontend không sửa trong bước tối ưu backend này; build và 31 test frontend ở mục 4 vẫn thuộc đúng source frontend main dùng cho smoke.

### Candidate thay thế: đếm theo nhóm status, giữ trang song song

- `readPage` hỗ trợ lựa chọn nội bộ `countSummary`: group theo `$status` và `$sum: 1`, rồi cộng ở Node thành `{total, active, inactive}`. Bản ghi status cũ/thiếu vẫn góp vào total; không tự chuẩn hóa hay loại dữ liệu legacy.
- Không dùng facet, không có lượt đọc trang theo danh sách ID, không thêm sort hoặc truy vấn tuần tự. Với contains/history có summary, dùng một query trang + một grouped count thay một query trang + ba count.
- Unit/HTTP backend cuối **111/111**, MongoDB integration cuối **15/15** đạt cho đúng source này. Test chứng minh hai query được khởi động song song, giữ cùng filter quyền, không đếm lặp và trang có tổng thumbnail 20 MiB vẫn hoạt động.
- Chromium cuối **27/27** trên candidate grouped-status, report `browser-55419c7fd0c5e487b88a98c7/report.json`, cleanup thành công. Không sửa frontend hoặc dùng tài khoản production.
- Lượt group dùng hai biểu thức điều kiện đã thử riêng (`code-1cdd4e43ab776ce0d582cd56.json`, 20 mẫu/phiên bản); không lấy timing của lượt đó thay cho group theo status cuối cùng. Các control endpoint không đổi handler vẫn có dao động, nên không gán chênh lệch nhỏ cho tối ưu.

### Đo candidate cuối: 5.000 lớp / 5.000 user / 50 mẫu

Report `code-c75e249f5b057154afdad6da.json`, Node v20.20.0, MongoDB 7.0.45 / 2 CPU / 1 GiB, cùng DB/index, 50 mẫu warm ABBA mỗi phiên bản; không chạy đồng thời test/build/browser khác do agent khởi động. Before là main `c9aca17`, after là working tree đã hash. Mọi workload có digest toàn bộ JSON response trước/sau khớp; hash file candidate được đối chiếu lại sau benchmark. Cleanup DB/container/snapshot hoàn tất.

| Workload | Median ms main → candidate | p95 ms main → candidate | Command main → candidate | Document classes xét main → candidate |
|---|---:|---:|---:|---:|
| Admin page 1, không filter | 16,57 → 14,09 | 24,16 → 21,20 | 4 → 4 | 5.020 → 20 |
| q broad + summary | 24,31 → 23,93 | 29,69 → 30,45 | 6 → 4 | 10.020 → 5.020 |
| q broad + history + summary | 23,39 → 22,44 | 27,09 → 25,03 | 6 → 4 | 10.066 → 5.066 |

Số document là tổng các plan classes quan sát trong request đầu, không bao gồm user auth/populate; số command bao gồm toàn request. Index-only count dùng `_id_` xét 5.001 key và **0 document**, thay cho COLLSCAN 5.000 document; trang vẫn đọc 20 document. Exact count vẫn tuyến tính theo số key, không phải O(1).

q + summary vẫn có một count COLLSCAN 5.000 document để giữ contains/exact totals, nhưng bỏ được hai count status riêng, giảm tổng scan khoảng một nửa. Đây là cải thiện lượng công việc DB/số command, **không phải bằng chứng latency tìm kiếm cải thiện đáng kể**: median gần nhau và p95 q + summary còn tăng nhẹ. q không summary/history không đổi chiến lược; control users trang đầu 14,42 → 14,21 ms, student classes 18,98 → 19,07 ms cho thấy nhiễu vẫn tồn tại. Không cam kết latency production, tải đồng thời hay write throughput.

**Phần còn lại:** count contains vẫn có thể scan cả tập. Muốn giảm sâu hơn mà giữ tìm chuỗi con phải thiết kế index tìm kiếm riêng/field dẫn xuất và kế hoạch backfill hoặc dịch vụ search; ảnh hưởng schema/storage/write/migration cần chủ dự án duyệt riêng. Không tự đổi contains thành prefix/full-text, giảm độ chính xác count, ép index tốn kém hoặc coi yêu cầu no-COLLSCAN đã đạt toàn bộ.
