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
