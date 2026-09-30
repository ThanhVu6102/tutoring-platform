// ============================================================================
// FILE: backend/utils/superAdmin.js
// MỤC ĐÍCH: Các hàm dùng chung để nhận diện và bảo vệ Super Admin gốc.
// Được dùng ở: routes/auth.js (đăng nhập), routes/users.js (cấm xóa/hạ quyền),
// server.js + seed-admin.js (tự tạo/khôi phục admin khi khởi động).
// ============================================================================

// Nạp cấu hình admin cố định (email + password mặc định).
const DEFAULT_ADMIN = require('../config/defaultAdmin');

// Nạp model User để truy vấn MongoDB (tìm / tạo admin).
const User = require('../models/User');

// ----------------------------------------------------------------------------
// HÀM: isSuperAdminEmail(email)
// KIỂM TRA: email truyền vào có phải email của Super Admin gốc hay không.
// - Trả về true/false.
// - So sánh không phân biệt hoa/thường và bỏ khoảng trắng thừa.
// - Ví dụ: 'ADMIN@eklasses.vn' vẫn được coi là Super Admin.
// ----------------------------------------------------------------------------
function isSuperAdminEmail(email) {
  // Chỉ chuỗi mới hợp lệ; số/null/undefined -> false ngay.
  return (
    typeof email === 'string' &&
    // trim(): bỏ khoảng trắng đầu/cuối; toLowerCase(): đưa về chữ thường để so sánh.
    email.trim().toLowerCase() === DEFAULT_ADMIN.email.toLowerCase()
  );
}

// ----------------------------------------------------------------------------
// HÀM: isSuperAdminPassword(password)
// KIỂM TRA: mật khẩu có hợp lệ cho Super Admin hay không.
// - Ưu tiên 1: khớp mật khẩu cố định trong config/defaultAdmin.js -> luôn đúng.
// - Ưu tiên 2: khớp ADMIN_PASSWORD trên biến môi trường (nếu có cấu hình) -> cũng đúng.
// - Giúp vừa "ghi cố định" vừa tương thích khi deploy Vercel có đặt env riêng.
// ----------------------------------------------------------------------------
function isSuperAdminPassword(password) {
  // Mật khẩu phải là chuỗi, nếu không thì coi như sai.
  if (typeof password !== 'string') return false;
  // Nhánh 1: So sánh với mật khẩu cố định trong code.
  if (password === DEFAULT_ADMIN.password) return true;
  // Nhánh 2: So sánh với mật khẩu trên env (chỉ khi env có giá trị).
  if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) return true;
  // Không khớp nhánh nào -> sai mật khẩu.
  return false;
}

// ----------------------------------------------------------------------------
// HÀM: ensureSuperAdmin()
// ĐẢM BẢO: tài khoản Super Admin gốc luôn tồn tại trong MongoDB với role admin.
// HOẠT ĐỘNG:
//  - B1: Tìm user theo email gốc trong DB.
//  - B2: Nếu chưa có -> tạo mới với role 'admin' (password sẽ tự hash ở model).
//  - B3: Nếu đã có -> ép role về 'admin'; nếu password trong DB lệch khỏi cả
//        mật khẩu cố định lẫn env thì reset về mật khẩu cố định.
// - Được gọi tự động mỗi khi server kết nối DB (server.js) nên không cần seed tay.
// - Trả về: document admin trong DB.
// ----------------------------------------------------------------------------
async function ensureSuperAdmin() {
  // Chuẩn hóa email gốc về chữ thường để truy vấn nhất quán.
  const email = DEFAULT_ADMIN.email.toLowerCase();
  // Tìm admin gốc trong collection users.
  let admin = await User.findOne({ email });
  // TRƯỜNG HỢP 1: Chưa có trong DB -> tạo mới.
  if (!admin) {
    // Tạo document mới: tên lấy từ env ADMIN_NAME (nếu có), còn không lấy tên mặc định.
    admin = new User({
      name: process.env.ADMIN_NAME || DEFAULT_ADMIN.name,
      email,
      password: DEFAULT_ADMIN.password, // sẽ được hash tự động ở pre-save của model.
      role: 'admin', // cố định quyền cao nhất.
    });
    // Lưu xuống MongoDB.
    await admin.save();
    // In log để biết đã tự tạo.
    console.log(`Đã tạo Super Admin mặc định: ${email}`);
  } else {
    // TRƯỜNG HỢP 2: Đã có trong DB -> kiểm tra và khôi phục nếu bị sửa sai.
    let changed = false; // cờ đánh dấu có thay đổi cần lưu lại hay không.
    // Nếu role bị đổi thành teacher/student thì ép về 'admin'.
    if (admin.role !== 'admin') {
      admin.role = 'admin';
      changed = true;
    }
    // Kiểm tra password trong DB có khớp mật khẩu cố định không (dùng bcrypt so sánh).
    const okDefault = await admin.comparePassword(DEFAULT_ADMIN.password).catch(() => false);
    // Kiểm tra có khớp mật khẩu trên env không (nếu có đặt env).
    const okEnv = process.env.ADMIN_PASSWORD
      ? await admin.comparePassword(process.env.ADMIN_PASSWORD).catch(() => false)
      : false;
    // Nếu lệch cả hai -> reset về mật khẩu cố định để không bị khóa đăng nhập.
    if (!okDefault && !okEnv) {
      admin.password = DEFAULT_ADMIN.password; // gán thô, pre-save sẽ hash lại.
      changed = true;
    }
    // Chỉ gọi save() khi có thay đổi để tránh ghi DB thừa.
    if (changed) {
      await admin.save();
      console.log(`Đã khôi phục quyền Super Admin: ${email}`);
    }
  }
  // Trả về document admin để nơi gọi có thể dùng tiếp nếu cần.
  return admin;
}

// Xuất 3 hàm ra ngoài để các file khác require() và sử dụng.
module.exports = { isSuperAdminEmail, isSuperAdminPassword, ensureSuperAdmin };
