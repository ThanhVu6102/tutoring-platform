// Chỉ giữ danh tính được bảo vệ để tương thích dữ liệu cũ, không chứa mật khẩu.
// Tài khoản vẫn phải được bootstrap thủ công và xác thực bằng hash trong DB.
module.exports = {
  name: 'Quản trị viên',
  email: 'admin@eklasses.vn',
};
