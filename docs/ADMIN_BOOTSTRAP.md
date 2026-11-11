# Bootstrap và chuyển đổi tài khoản quản trị — BE #05 / #26

## Hành vi mới

- Không có mật khẩu mặc định trong cấu hình ứng dụng. Login không tạo tài khoản, nâng quyền, mở khóa hoặc khôi phục mật khẩu.
- Mọi role, kể cả admin gốc, dùng bcrypt hash trong MongoDB và cùng kiểm tra xóa mềm, khóa, trạng thái, đình chỉ/cấm vĩnh viễn trước khi cấp JWT.
- Kết nối/reconnect DB không bootstrap admin. Danh tính `admin@eklasses.vn` vẫn được bảo vệ khỏi đăng ký public, xóa/hạ quyền như trước; đó không phải quyền bỏ qua xác thực.
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` chỉ dùng cho lệnh bootstrap thủ công, không phải thông tin đăng nhập ưu tiên. Admin đổi mật khẩu tại hồ sơ bằng mật khẩu hiện tại.

## Tạo mới có kiểm soát

1. Người vận hành xác minh môi trường/database đích và quyền chạy lệnh.
2. Qua secret manager hoặc môi trường shell riêng, cung cấp `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, tùy chọn `ADMIN_NAME`. Không ghi password vào git, terminal history, log hoặc issue. Password cần ngẫu nhiên từ password manager, ít nhất 16 ký tự, tối đa 72 byte UTF-8; không có fallback.
3. Chạy `npm run seed:admin --prefix backend`. Script yêu cầu URI tường minh, kiểm tra cấu hình trước khi kết nối, tạo **một** admin active mới. Mongoose hash password trước khi lưu; script không in thông tin đăng nhập.
4. Nếu email đã tồn tại (kể cả student, admin bị khóa/xóa), script báo lỗi và **không sửa** password/role/trạng thái. Unique index email ngăn insert trùng; không dùng lệnh này để khôi phục tài khoản.
5. Xóa `ADMIN_PASSWORD` khỏi môi trường bootstrap và không đưa biến bootstrap vào runtime web. Kiểm tra đăng nhập bằng mật khẩu được cấp qua kênh riêng.

## Chuyển đổi hệ thống đã triển khai (cần người vận hành xác nhận)

**Chỉ sửa code không vô hiệu hóa hash cũ đang nằm trong DB hoặc token đã cấp.** Nếu DB vẫn lưu mật khẩu từng công khai thì mật khẩu đó vẫn so sánh bcrypt thành công cho đến khi được đổi. Không tự coi issue đã nghiệm thu production.

- [ ] Kiểm kê các tài khoản admin gốc và admin từ env trên đúng môi trường qua kênh riêng; không đăng danh tính/dữ liệu thực lên issue.
- [ ] Trong cửa sổ bảo trì hoặc chặn truy cập auth công khai, triển khai code đã bỏ bypass/startup reset; bảo đảm instance cũ không còn phục vụ. Không mở lại đăng nhập trước khi thay hash cũ.
- [ ] Đổi tất cả mật khẩu admin từng công khai hoặc dùng chung qua luồng đổi mật khẩu đã xác thực; lưu bí mật mới trong password manager. Nếu không còn thông tin xác thực, người có thẩm quyền dùng quy trình khôi phục DB riêng đã được phê duyệt, không thêm bypass/reset tự động.
- [ ] Kiểm tra mật khẩu mới hoạt động, thông tin cũ/env cũ bị từ chối, restart không đổi password, admin bị khóa không nhận token.
- [ ] Đánh giá token/phiên đã cấp và dấu hiệu truy cập trái phép. Nếu có rủi ro, xoay `JWT_SECRET` mạnh qua secret manager ở mọi instance rồi ngừng instance giữ khóa cũ để vô hiệu hóa toàn bộ token HS256 hiện tại (mọi role phải đăng nhập lại). Không ghi giá trị secret hoặc token vào log. Chưa có thu hồi từng phiên; #27 xử lý cấu hình JWT/fail-closed riêng.
- [ ] Ghi nhận người thực hiện, thời điểm, môi trường và xác nhận rotation/revocation qua kênh vận hành riêng; chỉ công bố trạng thái không nhạy cảm.

Các bước vận hành trên **chưa được chạy/xác nhận** trong lần sửa local này. Không truy cập hoặc sửa DB production.

## Kiểm thử local

`npm test --prefix backend` có regression `adminSecurity.test.js`: HTTP login hai email admin, bcrypt thật, đổi mật khẩu, chống env/default bypass, không tự tạo/nâng quyền/mở khóa, mọi trạng thái hạn chế; bootstrap tạo mới qua hook hash thật và từ chối ghi đè; cache/reconnect không gọi khởi tạo admin.

Test dùng HTTP local và mock DB/collection; không thay thế nghiệm thu MongoDB thật hoặc xác nhận rotation production.
