# Trạng thái và theo dõi dự án

Tập trung lịch sử tích hợp, issue, bằng chứng kiểm tra và việc còn lại. Tài liệu chức năng chỉ giữ hành vi, contract, cách sử dụng và kiểm thử.

## Phiên bản và issue

| Phạm vi | Mốc đã đối chiếu | Trạng thái |
|---|---|---|
| Bảo mật backend và tối ưu BE #04 | PR [#50](https://github.com/ThanhVu6102/tutoring-platform/pull/50), [#51](https://github.com/ThanhVu6102/tutoring-platform/pull/51) → [#52](https://github.com/ThanhVu6102/tutoring-platform/pull/52), main `80b0da1` | #11 và #26–#30 đã Closed/Done; vận hành #26–#27 do chủ dự án xác nhận ngày 2026-11-13 |
| Giao diện chung, responsive và lọc lớp | PR #47/#48, #55, #56/#57, #58/#59 | Đã vào main; bằng chứng FE04/FE11 tại [FRONTEND_QA.md](FRONTEND_QA.md) |
| UI bài tập và kiểm chứng mật khẩu | `82a2df3`, `767f204`; PR [#60](https://github.com/ThanhVu6102/tutoring-platform/pull/60), [#61](https://github.com/ThanhVu6102/tutoring-platform/pull/61) → [#62](https://github.com/ThanhVu6102/tutoring-platform/pull/62), main `af3dd9e` | #29/#41 Closed/Done; #41 được chủ dự án nghiệm thu trước phát hành |
| Quản lý tài khoản | `fec6d32`, PR [#64](https://github.com/ThanhVu6102/tutoring-platform/pull/64), develop `1c2910c` | #63 Open / In review, chờ nghiệm thu UI cuối; đã được duyệt đưa vào đợt phát hành cùng tài liệu |

Các mốc source trước đợt đồng bộ tài liệu: **main `af3dd9e`**, **develop `1c2910c`**. Đây là tham chiếu cho bằng chứng kiểm thử, không phải con trỏ branch tự cập nhật. Source develop sau PR #64 khớp source tính năng đã kiểm thử; URL website trên main đã được giữ trong README cập nhật, không kèm tham số tracking.

## Bằng chứng kiểm tra

Các số dưới đây thuộc snapshot đã nêu, không phải test mới khi chỉnh tài liệu. MongoDB tính cả test bao ngoài; build frontend của các mốc đều thành công.

| Snapshot | Backend / frontend | MongoDB và browser |
|---|---|---|
| BE #04 `32e6ff8` | 111/111; frontend `c9aca17` 31/31 | Filter/moderation 15/15; Chromium 27/27 |
| PR #52, source `c3a5623` | 135/135; 46/46 (11 suite) | MongoDB 35/35; Chromium 27/27, JWT giả, không phải test login |
| UI #29 `82a2df3` | 138/138; 64/64 (12 suite) | MongoDB 36/36; UI bài tập 12/12, Chromium hồi quy 27/27 |
| Kiểm chứng #41 `767f204` | 135/135; 61/61 (13 suite) | MongoDB 35/35; đăng nhập/đổi mật khẩu UI thật 50/50 |
| PR #62, source `8d6e088` | 138/138; 79/79 (14 suite) | Học liệu 6/6; UI bài tập 12/12, mật khẩu 50/50, hồi quy 27/27 |
| PR #64, source `fec6d32` | 139/139; 97/97 (15 suite) | MongoDB hồi quy 36/36; bộ tài khoản HTTP/MongoDB/Chromium 27/27, Chromium hồi quy 27/27 |

Audit production dependency backend ở các mốc #52, nhánh #29/#41 và #64: **0 vulnerabilities tại thời điểm chạy**, không đại diện audit frontend hoặc mọi rủi ro bảo mật. Initial JS gzip: #52 **80,90 kB**, #64 **81,64 kB**. Các check Vercel của PR #52, #60–#62, #64 thành công trước merge; không thay kiểm thử vận hành sau phát hành.

## Việc còn lại và giới hạn kiểm chứng

- #63 cần chủ dự án nghiệm thu giao diện cuối; việc được duyệt phát hành main không tự thay trạng thái issue sang Done.
- Chưa xác minh mọi luồng production, compression của mọi API riêng tư, tải đồng thời/cold start hoặc tác động index khi ghi dữ liệu. Giới hạn truy vấn cụ thể nằm ở [PERFORMANCE.md](PERFORMANCE.md).
- Browser dùng headless/viewport mô phỏng, chưa thay kiểm thử điện thoại vật lý. Dữ liệu kiểm thử giả trong Docker riêng; không đổi lại tài khoản Preview lịch sử, seed/migrate hoặc đọc/ghi tài khoản production.
- Xác nhận vận hành #26–#27 do chủ dự án cung cấp; không phải agent tự xoay secret hoặc độc lập kiểm tra từng thao tác production. JWT chưa có thu hồi từng phiên.

## Bảo trì tài liệu và dấu vết kỹ thuật

- Đã tổng hợp 15 ghi chú commit/PR/issue tạm của EKLASSES theo chủ đề, không sao chép checklist/mẫu PR trùng nhau. `RELEASE_NOTES.md` được bỏ vì trùng mục đích với file này.
- Các tài liệu cũ `CHANGE_PASSWORD.md`, `MODERATION_PAGINATION_PLAN.md`, `PERFORMANCE_ACCEPTANCE.md` lần lượt đã đưa vào `USER_PRIVACY.md`, `APPEALS.md`, `PERFORMANCE.md`; bản cũ còn trong lịch sử Git. Không đưa tài liệu Lab khác, bản sao worktree hoặc profile trình duyệt vào dự án.
- README gốc giữ tổng quan, chức năng, cài đặt và liên kết tài liệu; bảng commit cũ được bỏ khỏi trang tổng quan để không nhầm cơ chế admin lịch sử với hành vi hiện tại. Lịch sử commit đầy đủ vẫn tra được trong Git.
- Hai subagent audit API và review UI #63 hoàn tất sau lỗi quota ban đầu; các bước #29/bảo mật trước đó không phải tất cả đều có review độc lập thành công. Kết quả review không thay kiểm thử thực tế.
- Các lỗi được phát hiện và sửa: pagination user trả 500 thay vì 400, label form chưa ổn định, harness thiếu xác nhận đăng xuất và race trong retry. Không tính lượt lỗi là đạt.
- Raw report/screenshot ở `docs/local/` bị ignore. Các DB/container lab đã dọn; hai lượt harness tài khoản kết thúc trước cleanup đã được kiểm tra đúng nhãn owner/run và loopback rồi dọn đúng tài nguyên. Không xóa file tạm/local hoặc tài nguyên dùng chung.

Report tích hợp tham chiếu: `assignment-ui-9b5e634ffe675101b08ae549`, `password-ui-95f5c2c696d0c0bf91dfbfc7`, `browser-5ac3cb7f4cb644ba61a70761`; quản lý tài khoản: `accounts-ui-47ee3b6a170aa7b7ce839d6e`, `browser-affc28444e2c3b09f41fe4b1`. Chi tiết benchmark được giữ riêng trong [PERFORMANCE.md](PERFORMANCE.md#ket-qua).
