# Swagger / OpenAPI của EKLASSES

Tài liệu được khai báo theo **OpenAPI 3.0.3**, có Swagger UI tự host (không tải JavaScript từ CDN ngoài).

## Địa chỉ

| Tài nguyên | Production | Local backend |
|---|---|---|
| Swagger UI | https://eklasses.id.vn/api/docs | http://localhost:5000/api/docs |
| Đặc tả OpenAPI JSON | https://eklasses.id.vn/api/openapi.json | http://localhost:5000/api/openapi.json |
| Alias JSON | https://eklasses.id.vn/api/docs.json | http://localhost:5000/api/docs.json |

Các URL production có Swagger sau khi phiên bản chứa thay đổi này được triển khai. URL local frontend qua proxy `/api` cũng sử dụng cùng tài liệu.

**Thay đổi contract tài liệu:** trước đây `GET /api/docs` trả một danh sách endpoint JSON rút gọn. Nay đường dẫn này trả HTML Swagger UI; client cần đặc tả máy đọc được chuyển sang `/api/openapi.json` hoặc `/api/docs.json`. JSON mới theo chuẩn OpenAPI, không giữ shape `endpoints/baseURL` cũ. Không còn liệt kê API chưa tồn tại như `POST /api/auth/logout` hay `GET /api/quizzes`.

## Sử dụng

1. Chạy backend với cấu hình môi trường hiện có: `npm start --prefix backend`, rồi mở Swagger local.
2. Trong **Servers**, mặc định chọn `/` (cùng origin hiện tại), phù hợp local/preview/production. Domain cố định là `https://eklasses.id.vn`; không phụ thuộc URL deployment ngẫu nhiên. Dùng trang Swagger local khi gọi HTTP localhost để tránh chặn mixed content trên trang HTTPS.
3. Thử đăng ký tài khoản test hoặc đăng nhập qua `POST /api/auth/login`. Giáo viên chờ duyệt chưa nhận token khi đăng ký.
4. Sao chép `token` nhận được, bấm **Authorize**, dán **chỉ token** (không thêm `Bearer `). Swagger tự gắn `Authorization: Bearer ...`.
5. Mở nhóm API, đọc **Description**, **Parameters**, **Request body**, **Responses** trước khi bấm **Try it out → Execute**.
6. Bấm **Logout** trong hộp Authorize để xóa token khỏi Swagger. Thao tác này chỉ bỏ token phía client; hệ thống chưa có endpoint thu hồi JWT. Token cũng không được lưu qua reload trang.

### An toàn khi thử API

- **Execute gửi request thật**, có thể tạo/xóa/sửa dữ liệu. Dùng tài khoản và database local/QA được phép, không thử xóa/chấm điểm/kiểm duyệt trên dữ liệu production thật.
- GET kiểm duyệt và lịch sử cảnh báo có thể chốt cảnh báo hết hạn, kéo theo cập nhật chế tài. Không coi mọi GET là chỉ đọc.
- Tài liệu công khai, nhưng các API nghiệp vụ vẫn giữ middleware JWT, role từ database, quyền lớp và trạng thái tài khoản. Swagger không mở rộng quyền.
- Không chia sẻ token, mật khẩu thật hoặc URI database. Ví dụ chỉ dùng `example.test` và dữ liệu giả.
- Swagger không gửi đặc tả sang validator bên ngoài, không lưu authorization lâu dài và không nhận cấu hình tùy ý từ query string.
- UI và OpenAPI tải được khi database không sẵn sàng. `/api/health` vẫn qua database gate; docs hoạt động không chứng minh database đang hoạt động.

## Phạm vi và contract đáng chú ý

Đặc tả bao phủ **76 operation nghiệp vụ**, cùng health/UI/JSON docs (tổng 80), gồm xác thực, hồ sơ/mật khẩu/tài khoản, lớp/ghi danh, buổi học/điểm danh, video, tài liệu, quiz, bài tập, thông báo, cảnh báo/kháng cáo và kiểm duyệt.

- Danh sách chính trả `{ data, page, limit, total, totalPages }`, mặc định 20, cap 100 phần tử/trang; page cap 10.000. Session list trả `{ items, page, limit, total }` và **từ chối** số vượt giới hạn thay vì cap. Một số API legacy trả mảng; xem từng operation.
- DTO hồ sơ/submissions phụ thuộc người xem. Giáo viên không nhận email riêng của học sinh qua roster; học sinh chỉ nhận bài nộp assignment của mình.
- Học liệu và bài nộp assignment là URL, không có multipart upload trên các route này.
- Quiz submit ghép câu trả lời theo vị trí mảng. Deadline/time limit và giới hạn một lượt chưa được handler submit cưỡng chế; không suy ra có kiểm tra server chỉ từ UI hoặc schema model.
- Một số route legacy trả 500 khi Mongoose validation lỗi. Đặc tả mô tả hiện trạng, không cài thêm runtime validator hoặc đổi nghiệp vụ.
- Transaction-required review/scheduling cần MongoDB replica set/Atlas. Cấu hình JWT không hợp lệ có thể trả 503 trước khi xử lý nghiệp vụ.

## Bảo trì và kiểm tra

Nguồn khai báo: `backend/openapi/`:

- `helpers.js`, `schemas.js`: builder, schema dùng chung và lỗi/phân trang.
- `accounts.js`: auth, hồ sơ, mật khẩu, quản trị tài khoản.
- `classes.js`: metadata lớp, ghi danh, yêu cầu tham gia, kháng cáo khóa lớp.
- `learning.js`: video, tài liệu, thông báo, quiz, assignment.
- `operations.js`: buổi học, điểm danh, cảnh báo và kiểm duyệt.
- `index.js`: hợp nhất đặc tả, server, bảo mật, nhóm API và diagnostic endpoints.

`backend/routes/apiDocs.js` phục vụ UI, JSON và allowlist asset. `vercel.json` đóng gói đúng các asset Swagger trong serverless function.

```bash
npm ci --prefix backend
npm run test:docs --prefix backend
npm test --prefix backend
```

Kiểm tra docs validate OpenAPI offline (không resolve URL ngoài), đối chiếu **method + path của toàn bộ router thực**, path parameters, schema/request examples, auth, asset HTTP và việc docs không gọi database gate. Khi thêm route, phải cập nhật đặc tả cùng PR; test sẽ báo thiếu/thừa operation. Kiểm tra cấu trúc không thay cho test API thực hoặc browser QA.

Kiểm tra trình duyệt Chromium local đã xác nhận UI render đủ 80 operation, mở được schema/ví dụ đăng nhập, Authorize hoạt động và xóa token khi reload; viewport desktop/mobile không có lỗi runtime/CSP hoặc tràn ngang ở trạng thái đã kiểm tra. Không gọi API nghiệp vụ hay gửi request ra CDN/validator bên ngoài trong smoke test này. Điều này chưa thay thế kiểm tra asset trên Vercel sau deploy.

Có thể import URL `/api/openapi.json` vào Postman hoặc công cụ hỗ trợ OpenAPI. Không cần tài khoản/token để tải đặc tả.
