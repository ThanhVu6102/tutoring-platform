// ============================================================================
// FILE: backend/config/defaultAdmin.js
// MỤC ĐÍCH: Ghi cố định tài khoản Admin gốc (Super Admin) của website.
// ----------------------------------------------------------------------------
// - Đây là tài khoản MẶC ĐỊNH, luôn tồn tại, luôn đăng nhập được.
// - KHÔNG thể bị xóa, KHÔNG thể bị hạ quyền (luôn là role 'admin').
// - CÓ quyền cấp / thu hồi quyền admin cho các tài khoản khác.
// - Đăng nhập không phụ thuộc biến môi trường hay phải chạy seed thủ công.
// ============================================================================

module.exports = {
  // Tên hiển thị của admin gốc trên website (ví dụ: hiện ở Navbar, Dashboard).
  name: 'Quản trị viên',

  // Email đăng nhập của admin gốc. So sánh không phân biệt hoa/thường.
  // Mọi nơi trong backend đều dùng email này để nhận diện Super Admin.
  email: 'admin@eklasses.vn',

  // Mật khẩu mặc định của admin gốc. Dùng để đăng nhập ở trang /login.
  // Nếu có biến môi trường ADMIN_PASSWORD thì mật khẩu đó cũng được chấp nhận,
  // nhưng mật khẩu cố định này LUÔN đúng để tránh bị khóa ngoài ý muốn.
  password: 'Admin123!',
};
