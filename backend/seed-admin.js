// ============================================================================
// FILE: backend/seed-admin.js
// MỤC ĐÍCH: Script tạo thủ công tài khoản Admin bằng lệnh:
//    npm run seed:admin --prefix backend
// - Luôn đảm bảo Super Admin gốc (admin@eklasses.vn / Admin123!) tồn tại.
// - Nếu có ADMIN_EMAIL khác trên env thì tạo thêm admin phụ (tùy chọn).
// - Server.js cũng tự gọi ensureSuperAdmin() nên script này chỉ dùng khi muốn
//   ép seed tay hoặc kiểm tra DB.
// BIẾN MÔI TRƯỜNG HỖ TRỢ: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI
// ============================================================================

// Nạp dotenv để đọc file .env (chứa MONGODB_URI, ADMIN_*...) vào process.env.
require('dotenv').config();
// Nạp mongoose để kết nối MongoDB.
const mongoose = require('mongoose');
// Nạp model User để tìm/tạo document admin.
const User = require('./models/User');
// Nạp cấu hình admin cố định (nguồn đúng duy nhất cho Super Admin gốc).
const DEFAULT_ADMIN = require('./config/defaultAdmin');

// Chuẩn bị thông tin admin muốn seed:
// - name: lấy ADMIN_NAME trên env, nếu không có thì lấy tên mặc định.
// - email: lấy ADMIN_EMAIL trên env, nếu không có thì lấy email gốc; chuẩn hóa lowercase.
// - password: lấy ADMIN_PASSWORD trên env, nếu không có thì lấy mật khẩu cố định.
const ADMIN = {
  name: process.env.ADMIN_NAME || DEFAULT_ADMIN.name,
  // Ghi chú: nếu ADMIN_EMAIL khác email gốc thì sẽ seed thêm 1 admin phụ,
  // chứ không thay thế Super Admin gốc.
  email: (process.env.ADMIN_EMAIL || DEFAULT_ADMIN.email).trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN.password,
};

// ----------------------------------------------------------------------------
// HÀM: main()
// LUỒNG SEED:
//  - B1: Kết nối MongoDB theo MONGODB_URI (mặc định localhost).
//  - B2: Đảm bảo Super Admin gốc tồn tại (tạo mới hoặc khôi phục role/pass).
//  - B3: Nếu ADMIN.email khác root thì seed thêm/cập nhật admin phụ.
//  - B4: Ngắt kết nối DB.
// ----------------------------------------------------------------------------
async function main() {
  // B1a: Lấy chuỗi kết nối MongoDB từ env, fallback về localhost khi chạy local.
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tutoring-platform';
  // B1b: Mở kết nối tới MongoDB.
  await mongoose.connect(uri);
  // B1c: In log xác nhận đã nối DB thành công.
  console.log('MongoDB connected');

  // ===== B2: LUÔN ĐẢM BẢO SUPER ADMIN GỐC TỒN TẠI =====
  // Email gốc chuẩn chữ thường để truy vấn nhất quán.
  const rootEmail = DEFAULT_ADMIN.email.toLowerCase();
  // Tìm Super Admin gốc trong DB.
  let root = await User.findOne({ email: rootEmail });
  // Trường hợp đã có -> khôi phục cho đúng chuẩn.
  if (root) {
    // Ép role về admin (phòng khi bị hạ quyền thủ công).
    root.role = 'admin';
    // Đồng bộ tên hiển thị theo env hoặc tên mặc định.
    root.name = process.env.ADMIN_NAME || DEFAULT_ADMIN.name;
    // Kiểm tra password hiện tại có khớp mật khẩu cố định không.
    const okDefault = await root.comparePassword(DEFAULT_ADMIN.password).catch(() => false);
    // Nếu không khớp mặc định:
    //  + mà ADMIN.email cũng là root và có ADMIN_PASSWORD -> dùng password env.
    //  + còn lại -> reset về mật khẩu cố định để không bị khóa.
    if (!okDefault && rootEmail === ADMIN.email && process.env.ADMIN_PASSWORD) {
      root.password = process.env.ADMIN_PASSWORD;
    } else if (!okDefault) {
      root.password = DEFAULT_ADMIN.password;
    }
    // Lưu thay đổi xuống DB (pre-save tự hash lại nếu password đổi).
    await root.save();
    console.log(`Super Admin mặc định đã sẵn sàng: ${rootEmail}`);
  } else {
    // Trường hợp chưa có -> tạo mới Super Admin gốc.
    await new User({
      name: process.env.ADMIN_NAME || DEFAULT_ADMIN.name,
      email: rootEmail,
      // Password: ưu tiên env nếu env đang chỉ định đúng cho root, còn không dùng mặc định.
      password:
        rootEmail === ADMIN.email && process.env.ADMIN_PASSWORD
          ? process.env.ADMIN_PASSWORD
          : DEFAULT_ADMIN.password,
      role: 'admin', // cố định quyền cao nhất.
    }).save();
    console.log(`Đã tạo Super Admin: ${rootEmail} / ${DEFAULT_ADMIN.password}`);
  }

  // ===== B3: SEED THÊM ADMIN PHỤ NẾU ADMIN_EMAIL KHÁC ROOT (TÙY CHỌN) =====
  if (ADMIN.email !== rootEmail) {
    // Tìm admin phụ theo email env.
    const existing = await User.findOne({ email: ADMIN.email });
    // Đã có -> ép role admin + cập nhật pass/name theo env (nếu có).
    if (existing) {
      existing.role = 'admin';
      if (process.env.ADMIN_PASSWORD) existing.password = process.env.ADMIN_PASSWORD;
      if (process.env.ADMIN_NAME) existing.name = process.env.ADMIN_NAME;
      await existing.save();
      console.log(`Admin phụ đã tồn tại, đã cập nhật quyền admin: ${ADMIN.email}`);
    } else {
      // Chưa có -> tạo mới admin phụ với role admin.
      await new User({ ...ADMIN, role: 'admin' }).save();
      console.log(`Đã tạo admin phụ: ${ADMIN.email}`);
    }
  }

  // B4: Ngắt kết nối MongoDB để script kết thúc gọn.
  await mongoose.disconnect();
}

// Gọi main(), nếu lỗi thì in ra và thoát với mã 1 để báo seed thất bại.
main().catch((err) => {
  console.error('Seed admin thất bại:', err?.message || err);
  process.exit(1);
});
