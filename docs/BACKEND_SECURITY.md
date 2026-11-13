# Bảo mật backend — phạm vi local và vận hành

**Cập nhật 2026-11-13:** chủ dự án xác nhận đã kiểm tra vận hành #26–#27; hai mục được chuyển Done trên Project, không phải agent tự đọc/đổi secret hoặc độc lập xác minh production. Phần mã nền đã vào develop qua PR #51 và main qua PR #52. Phần UI #29 bên dưới là bổ sung trên nhánh `fix/be-08-assignment-ui`, không tự coi đã phát hành cùng hai PR trước.

## JWT — BE #06 / issue #27

- `backend/config/jwt.js` kiểm tra cùng chính sách khi ký và xác minh; không có khóa dự phòng. Chỉ chấp nhận HS256, giữ hạn token 7 ngày.
- `JWT_SECRET` ít nhất 32 byte UTF-8, tối đa 1024 byte; không có khoảng trắng đầu/cuối, ký tự điều khiển, giá trị mẫu phổ biến hoặc chuỗi lặp ngắn. Kiểm tra này **không đo entropy**: phải dùng CSPRNG sinh ít nhất 32 byte ngẫu nhiên, chẳng hạn `crypto.randomBytes(32).toString('hex')`, đưa thẳng vào secret manager/môi trường riêng, không log/chia sẻ đầu ra.
- Thiếu/sai cấu hình: đăng ký/đăng nhập và API có token trả `503 {message}` chung trước khi truy vấn tài khoản. Request thiếu token vẫn `401`. Không ký token, không tạo tài khoản; không log/echo secret. Kiểm tra lúc request thay vì crash import để phù hợp Vercel; health/docs không phải bằng chứng xác thực sẵn sàng.
- Không đọc hoặc sửa secret production trong gói code. Vận hành phải kiểm tra cấu hình riêng cho từng môi trường, triển khai qua review/staging và xác nhận đăng nhập/đăng ký/API bảo vệ.

### Checklist khi từng dùng fallback/khóa công khai

1. Tạm hạn chế truy cập môi trường bị ảnh hưởng theo quy trình vận hành; đánh giá log/phiên, không suy từ lỗ hổng rằng đã bị khai thác.
2. Sinh khóa mới ngoài Git/log, lưu trong secret manager, cấu hình đồng nhất mọi instance và triển khai lại. Không duy trì cửa sổ chấp nhận khóa cũ/fallback.
3. Kiểm chứng token cũ bị từ chối, token đăng nhập mới được chấp nhận trên môi trường thử nghiệm được phép; người dùng phải đăng nhập lại. Đối chiếu thêm [xoay thông tin admin](ADMIN_BOOTSTRAP.md).
4. Người vận hành ghi xác nhận hoàn tất qua kênh riêng. Agent không chạy xoay khóa/thu hồi phiên thật; ngày 2026-11-13, chủ dự án xác nhận đã kiểm tra vận hành #26–#27. Không suy ra kết quả vận hành chỉ từ test.

Đổi mật khẩu từng user vẫn chưa tự thu hồi JWT đã cấp; xoay khóa toàn môi trường không thay cho cơ chế thu hồi từng phiên. Kiểm thử: `backend/tests/jwtSecurity.test.js`, `npm test --prefix backend`; chỉ khóa ngẫu nhiên/HTTP local và DB mock.

## Chấm quiz — BE #07 / issue #28

- Giữ `POST /api/quizzes/:quizId/submission/:submissionId/grade` và `{questionIndex, score, feedback?}`. Giáo viên phụ trách **lớp hiện tại** được chấm khi lớp không khóa; admin giữ quyền chấm cả lớp khóa. Không suy quyền từ giáo viên tạo đề hoặc role trong token/body.
- Helper `gradeQuizSubmission` xác minh quiz và lớp tồn tại; query bài nộp đồng thời theo `_id`, `quiz`, `class`. Không khớp trả `404`, sai quyền `403`, lớp khóa với giáo viên `423`.
- ID 24 hex; chỉ số nguyên không âm, câu trả lời phải khớp ID câu hỏi. Điểm là số hữu hạn trong `[0, question.points]`, feedback nếu gửi phải là chuỗi. Dữ liệu request sai trả `400`; câu trả lời/thang điểm snapshot không còn hợp lệ trả `409` trước ghi. Giữ điểm tối đa 0 của câu, không thay bằng 1; bài nộp có maxScore 0 phải được rà soát riêng, không chia cho 0.
- Tính tổng/phần trăm phía server, không nhận tổng/role từ client. Test HTTP hai lớp/hai giáo viên, học sinh/admin, ghép ID chéo, payload sai, tài nguyên thiếu, quan hệ câu hỏi và thang điểm cũ: `backend/tests/quizGrading.test.js`.
- Không migration dữ liệu, không có giao dịch nhiều document hoặc cam kết chống mọi race khi lớp/đề thay đổi đồng thời. Kiểm thử local không thay nghiệm thu deployment.

`npm run test:content:lab --prefix backend` tạo/dọn Docker replica set riêng, chạy `contentSecurity.integration.test.js` trên dữ liệu giả để đối chiếu điểm lưu thật trước/sau request. Cần Docker; không dùng URI production. Chạy suite trực tiếp chỉ khi đã cấp `CONTENT_SECURITY_TEST_MONGODB_URI` của replica set test được phép.

## Riêng tư bài nộp bài tập — BE #08 / issue #29

- `GET /api/assignments/class/:classId` giữ trang metadata, không có `submissions` cho bất kỳ role nào. Chi tiết `GET /api/assignments/:id` giữ tên trường nhưng học sinh chỉ nhận phần tử bài nộp của chính mình (chưa nộp: `[]`). File, điểm và feedback người khác không đi ra client.
- `assignmentClassAccess` xác minh lớp tồn tại, giáo viên đang phụ trách/thành viên học sinh và trạng thái lớp; không fail open khi thiếu lớp. Giáo viên phụ trách/admin mới nhận toàn bộ bài nộp; admin giữ quyền trên lớp khóa. Query `role`, `userId`, `fields` không mở rộng dữ liệu.
- DTO `assignmentForViewer` chỉ lọc bản sao, không sửa mảng sẽ lưu trong DB. API nộp/chấm tiếp tục trả `{message}`, không trả document có bài nộp người khác; chỉ học sinh được nộp, teacher/admin phải đủ quyền lớp trước chấm.
- `assignmentPrivacy.test.js` có hai học sinh, teacher/admin, quyền từ chối, danh sách/chi tiết, DTO không mutate và nộp/chấm. Suite MongoDB học liệu kiểm chứng payload và dữ liệu lưu thật, bảo toàn bài nộp người khác.
- Tab **Bài tập** mở `AssignmentWorkspace` ngay dưới danh sách, gọi endpoint chi tiết riêng; không tải submissions ở overview/danh sách. Học sinh nộp/cập nhật URL và xem thời gian, trạng thái muộn, điểm/nhận xét chính chủ; teacher/admin xem và chấm các bài nộp được cấp quyền. Tên lấy từ roster được phép xem, nếu không có thì dùng nhãn ID rút gọn, không mở quyền email.
- `POST /api/assignments/:id/submit` vẫn nhận `{fileUrl}`, nay kiểm tra URL HTTP(S) không rỗng; chỉ lưu URL, không tải file từ server. `POST /:id/grade` vẫn nhận `{studentId, score, feedback?}`: ID 24 hex, điểm là số hữu hạn trong `[0, totalPoints]`, feedback nếu gửi phải là chuỗi. Payload sai trả `400`; không tìm thấy bài nộp cần chấm trả `404` thay vì báo thành công khi không đổi điểm.
- Giữ chính sách hiện có: nộp sau hạn được ghi `isLate`; nộp lại đổi đường dẫn/thời gian và giữ điểm/nhận xét cũ. UI nói rõ và yêu cầu xác nhận thay bài nộp hoặc sửa điểm đã lưu. Không thêm upload nhị phân, endpoint, JSON key, quyền hoặc dependency mới; không migration dữ liệu.
- UI có nhãn/focus bàn phím, responsive, loading/rỗng/lỗi/thử lại, chặn gửi lặp; URL legacy không phải HTTP(S) không trở thành liên kết thực thi. Lỗi 401/403/404/423 bỏ dữ liệu cũ, response bài/lớp/phiên cũ không cập nhật màn hình mới. POST thành công nhưng GET làm mới lỗi chỉ thử đọc lại, không tự gửi POST lần nữa; giữ bản nháp của hàng chưa lưu khác.

### Chạy kiểm thử UI #29

`npm test --prefix frontend -- --watchAll=false --runInBand` kiểm tra form, payload tối thiểu, xác nhận, gửi lặp, điểm 0, lỗi/quyền, response cũ và thay phiên. Unit/HTTP backend thêm `assignmentValidation.test.js`; MongoDB thật bổ sung ca URL/điểm sai không ghi dữ liệu.

```powershell
npm run build --prefix frontend
npm run test:assignments:browser --prefix backend -- --tools-dir 'C:\path\to\temporary-playwright-tools'
```

Runner `assignment-ui-smoke.js` dùng Docker MongoDB riêng, router thật, production build và hai học sinh/teacher/admin, desktop/mobile; kiểm tra payload riêng tư, nộp/chấm qua UI và dữ liệu DB thực sự được lưu, bảo toàn bài người khác. Khóa/JWT/dữ liệu giả local, chặn mạng ngoài; không phải test đăng nhập, quyền truy cập file ngoài hoặc deployment production. Report/screenshot chỉ ở `docs/local/security/assignment-ui-<id>/`, không đưa lên Git.

### Bằng chứng bổ sung #29 ngày 2026-11-13

| Kiểm tra source nhánh `fix/be-08-assignment-ui` | Kết quả |
|---|---|
| Backend unit/HTTP | **138/138**, 16 file; thêm URL, thang điểm và bài nộp thiếu không ghi |
| Frontend | **64/64**, 12 suite; gồm 18 test bổ sung form/workspace/tích hợp tab |
| MongoDB thật | **36/36**, 4 suite tính cả test bao ngoài; DB/container đã dọn |
| Build frontend | Thành công, initial JS gzip **81,32 kB** |
| Chromium UI bài tập | **12/12**, hai học sinh + teacher/admin ở 1440×1000 và 390×844; report `assignment-ui-a1228be0d64518c60c718f46/report.json`; DB/container đã dọn |
| Chromium hồi quy chung | **27/27**, report `browser-b0c29a1467c1152bb900ef04/report.json`; DB/container đã dọn |
| Audit backend `--omit=dev` | **0 vulnerabilities** tại thời điểm chạy, không thay audit frontend |

Lượt UI đầu `assignment-ui-6ccab5ac28380a0059e0be83` dừng khi tìm ô nhận xét đã có nội dung; đã tách nhãn/textarea và gắn `htmlFor`/`id` để tên truy cập ổn định. Lượt hồi quy `browser-0b4a06992ec9701236f4ff42` dừng ở kiểm tra retry quá sớm; harness nay chờ HTTP 200, nút trở lại “Làm mới” và alert biến mất, **giữ assertion không còn alert**. Hai lượt lỗi đã dọn tài nguyên và giữ report local, không dùng làm bằng chứng đạt.

Audit read-only ban đầu từ subagent có kết quả; lượt review triển khai sau đó bị quota, không coi đã có review code độc lập thành công. Agent chính rà soát/tích hợp và chạy các kiểm tra trên. Chỉ commit/push nhánh riêng theo phạm vi được duyệt, không tự tạo PR, merge hoặc chạy ghi dữ liệu production. #29 giữ In review chờ review/tích hợp; kết quả local không tự đại diện bản đang phát hành.

## Dependency HTTP redirect — BE #09 / issue #30

- Chuỗi local trước sửa: `axios@1.20.0 → follow-redirects@1.16.1`; `npm audit --omit=dev` có **1 high** từ [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p). Advisory ảnh hưởng 1.16.0–1.16.1; bản vá tối thiểu 1.16.2.
- Override `follow-redirects` **1.16.3**, không nâng major Axios/không dùng `audit fix --force`; cài với `--ignore-scripts`. Bổ sung `backend/package-lock.json` v3 và bỏ ignore riêng file này để tái lập bằng `npm ci --prefix backend`. Lockfile chỉ dùng registry npm công khai, không có credential/đường dẫn máy cá nhân.
- Audit production backend sau cập nhật ngày 2026-11-11: **0 vulnerabilities**, không chỉ bỏ advisory mục tiêu. Kết quả phụ thuộc registry/thời điểm, không bảo đảm mọi dependency luôn an toàn hoặc thay audit frontend.
- `redirectSecurity.test.js` chỉ dùng hai server loopback: mảng `sensitiveHeaders` cùng/khác realm và header dạng object/array không làm lộ custom credential khi redirect khác origin; redirect cùng origin giữ credential; Axios vẫn theo redirect và loại Authorization/Cookie khi đổi origin.
- Advisory cần điều kiện sử dụng cụ thể; tài liệu upstream không khẳng định Axios 1.20.0 tái hiện lỗi này. Việc dependency có advisory không chứng minh ứng dụng hoặc production từng bị khai thác. Không gửi token/credential thật hoặc gọi dịch vụ ngoài trong test.

## Kiểm chứng và bàn giao ngày 2026-11-11

| Kiểm tra trên source gồm BE #06–#09 | Kết quả |
|---|---|
| Cài đặt sạch `npm ci --prefix backend --ignore-scripts --no-audit --no-fund` | Thành công, chỉ dùng lockfile/backend; không chạy lifecycle script |
| `npm test --prefix backend` sau cài đặt sạch | 135/135 đạt, 15 file unit/HTTP, gồm 19 test mới cho JWT/chấm quiz/bài nộp/redirect |
| Ba suite MongoDB cũ: appeals, class filters, moderation | 30/30 đạt, gồm test bao ngoài; Docker/DB riêng đã dọn |
| `npm run test:content:lab --prefix backend` sau cài đặt sạch | 5/5 đạt: 4 kịch bản + test bao ngoài; Docker/DB riêng đã dọn |
| Frontend `--watchAll=false --runInBand` | 37/37, 11 suite; còn cảnh báo tương thích tương lai React Router |
| `npm run build --prefix frontend` | Thành công, initial JS gzip 80,86 kB |
| Chromium production build, desktop/mobile, 3 role | 27/27 đạt; report local `browser-d84254983bfb8750292e0d03/report.json`, DB/container đã dọn. JWT giả, không phải test login hoặc UI nộp/chấm bài tập |
| `npm audit --prefix backend --omit=dev` sau cài đặt sạch | 0 vulnerabilities tại thời điểm chạy |

`npm ci` có cảnh báo deprecated Multer 1.x; không nâng major ngoài phạm vi #30. Audit không phải kiểm chứng không còn mọi rủi ro dependency. Các lượt subagent Gemini bị quota, không cung cấp kết quả được chấp nhận; thay đổi do agent chính thực hiện/rà soát, không tuyên bố đã có review độc lập thành công.

Tại lượt bàn giao 2026-11-11, các nhánh nối tiếp trên nền `fix/admin-profile-and-vietnamese-messages`: `fix/be-06-jwt-fail-closed` → `fix/be-07-quiz-grading-scope` → `fix/be-08-assignment-submission-privacy` → `fix/be-09-follow-redirects`. Mỗi issue có commit riêng, không phải bốn nhánh độc lập so với develop. Khi đó chưa tạo PR/merge theo tác vụ này; #27 còn xác nhận vận hành, #29 còn UI. Đây là trạng thái lịch sử, không thay trạng thái cập nhật đầu tài liệu.

### Kiểm tra tích hợp vào develop theo yêu cầu tiếp theo

Nền `develop` tại `9964fbb` hợp nhất các nhánh trên tới `72354dc` trong worktree riêng. Giữ các cải tiến avatar, kháng cáo và kiểm thử đã có trên develop; giải quyết xung đột form/hồ sơ theo quy tắc admin được đổi mật khẩu, cập nhật test cảnh báo cấu hình cũ cho đúng hành vi mới.

Chạy lại trên source tích hợp: backend **135/135**, frontend **46/46** (11 suite, gồm các test develop), MongoDB **35/35** (4 suite, tính cả test bao ngoài), build thành công (initial JS gzip **80,90 kB**), audit backend production **0 vulnerabilities**, diff không lỗi whitespace. Các tài nguyên Docker/DB đã dọn; đây là kiểm chứng local, không xác nhận xoay khóa hoặc vận hành production. Bước PR/merge do chủ dự án yêu cầu riêng; không tự đóng các issue còn thiếu tiêu chí vận hành/UI.

Chromium source tích hợp: **27/27** kiểm tra ba role trên desktop/mobile, report local `browser-1c4455a414e326e15b5a2162/report.json` trong worktree tích hợp; DB/container đã dọn. Vẫn dùng JWT/dữ liệu giả, không phải test đăng nhập hay UI nộp/chấm bài tập.
