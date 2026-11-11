# Bảo mật backend — phạm vi local và vận hành

## JWT — BE #06 / issue #27

- `backend/config/jwt.js` kiểm tra cùng chính sách khi ký và xác minh; không có khóa dự phòng. Chỉ chấp nhận HS256, giữ hạn token 7 ngày.
- `JWT_SECRET` ít nhất 32 byte UTF-8, tối đa 1024 byte; không có khoảng trắng đầu/cuối, ký tự điều khiển, giá trị mẫu phổ biến hoặc chuỗi lặp ngắn. Kiểm tra này **không đo entropy**: phải dùng CSPRNG sinh ít nhất 32 byte ngẫu nhiên, chẳng hạn `crypto.randomBytes(32).toString('hex')`, đưa thẳng vào secret manager/môi trường riêng, không log/chia sẻ đầu ra.
- Thiếu/sai cấu hình: đăng ký/đăng nhập và API có token trả `503 {message}` chung trước khi truy vấn tài khoản. Request thiếu token vẫn `401`. Không ký token, không tạo tài khoản; không log/echo secret. Kiểm tra lúc request thay vì crash import để phù hợp Vercel; health/docs không phải bằng chứng xác thực sẵn sàng.
- Không đọc hoặc sửa secret production trong gói code. Vận hành phải kiểm tra cấu hình riêng cho từng môi trường, triển khai qua review/staging và xác nhận đăng nhập/đăng ký/API bảo vệ.

### Checklist khi từng dùng fallback/khóa công khai

1. Tạm hạn chế truy cập môi trường bị ảnh hưởng theo quy trình vận hành; đánh giá log/phiên, không suy từ lỗ hổng rằng đã bị khai thác.
2. Sinh khóa mới ngoài Git/log, lưu trong secret manager, cấu hình đồng nhất mọi instance và triển khai lại. Không duy trì cửa sổ chấp nhận khóa cũ/fallback.
3. Kiểm chứng token cũ bị từ chối, token đăng nhập mới được chấp nhận trên môi trường thử nghiệm được phép; người dùng phải đăng nhập lại. Đối chiếu thêm [xoay thông tin admin](ADMIN_BOOTSTRAP.md).
4. Người vận hành ghi xác nhận hoàn tất qua kênh riêng. **Chưa chạy xoay khóa/thu hồi phiên thật ở đây**; issue chưa đủ điều kiện nghiệm thu production chỉ từ test.

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
- **Giới hạn UI:** danh sách thẻ frontend dùng metadata và được kiểm thử hồi quy/build; nút “Nộp Bài/Xem Nộp Bài” trong `frontend/src/pages/ClassDetail.js` hiện chưa có handler. Chưa có kiểm thử xuyên suốt UI nộp/chấm; không coi tiêu chí này đã đạt và không tự bổ sung màn hình trong gói BE.
