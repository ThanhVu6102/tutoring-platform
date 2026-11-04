# Đổi mật khẩu chính chủ — issue #41

## API

`PATCH /api/users/password` yêu cầu Bearer token hợp lệ, tài khoản đang hoạt động và body:

```json
{ "currentPassword": "<mật khẩu hiện tại>", "newPassword": "<mật khẩu mới>" }
```

- Chỉ ID từ phiên đăng nhập được dùng; body không chọn được tài khoản khác.
- Mật khẩu hiện tại là chuỗi không rỗng, tối đa 72 byte UTF-8. Mật khẩu mới ít nhất 8 ký tự, tối đa 72 byte UTF-8, khác mật khẩu hiện tại. Không trim mật khẩu.
- Kiểm tra bcrypt, hash mới bằng cost 10. Ghi có điều kiện theo hash cũ và trạng thái tài khoản để yêu cầu cạnh tranh không ghi đè hoặc cập nhật sau khi tài khoản đã bị chặn.
- `200 {message}`: thành công, không trả hash/mật khẩu/token. `400`: dữ liệu sai hoặc mật khẩu hiện tại sai. `401`: chưa đăng nhập. `403`/`423`: tài khoản không đủ điều kiện. `409`: thay đổi đồng thời. `500`: lỗi nội bộ, không log exception có thể chứa dữ liệu bí mật.
- Các phiên JWT cũ **vẫn có hiệu lực đến khi hết hạn**. Không có cơ chế thu hồi phiên hoặc reset qua email trong issue này.
- Super Admin mặc định và admin đăng nhập bằng cấu hình `ADMIN_EMAIL`/`ADMIN_PASSWORD` bị từ chối đổi tại hồ sơ vì cơ chế đăng nhập có thể chấp nhận/khôi phục mật khẩu cấu hình. Cấu hình quản trị và JWT là phạm vi #26/#27; API này không khắc phục các vấn đề đó.
- Không migration schema hoặc thay đổi mật khẩu tài khoản hiện có tự động.

## Giao diện

Hồ sơ có form riêng: mật khẩu hiện tại, mật khẩu mới, nhập lại. Form kiểm tra khớp, giới hạn UTF-8, khóa thao tác khi gửi, thông báo thành công/lỗi và xóa cả ba ô khi thành công. Không lưu mật khẩu vào localStorage/sessionStorage hoặc gửi cùng cập nhật hồ sơ. Tái sử dụng CSS hồ sơ hiện có; không thêm dependency.

## Kiểm thử

- `npm test --prefix backend`: gồm `tests/changePassword.test.js` (validation, bcrypt, cập nhật cạnh tranh với mock, HTTP auth/error/privacy).
- `npm test --prefix frontend -- --watchAll=false --runInBand`: gồm `pages/ProfilePage.test.js` (form độc lập, sai xác nhận, gửi lặp, thành công/lỗi, hồi quy lưu hồ sơ).
- `npm run build --prefix frontend`.
- Test mock không thay thế kiểm tra đăng nhập bằng mật khẩu mới/cũ trên môi trường triển khai được chủ dự án cho phép. Không đăng thông tin đăng nhập test trong issue/PR.
