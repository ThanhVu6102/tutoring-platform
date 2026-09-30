// ============================================================================
// FILE: backend/routes/users.js
// MỤC ĐÍCH: API quản lý người dùng.
// - Mọi user đăng nhập đều xem/sửa được profile của chính mình.
// - Chỉ admin mới được list user, cấp/thu hồi quyền, xóa user.
// - Super Admin gốc (admin@eklasses.vn) KHÔNG thể bị xóa hay đổi quyền.
// ============================================================================

// Nạp express để tạo router cho nhóm /api/users.
const express = require('express');
// Nạp 2 middleware: authMiddleware (kiểm tra JWT) và adminOnly (chỉ admin qua được).
const { authMiddleware, adminOnly } = require('../middleware/auth');
// Nạp model User để truy vấn MongoDB.
const User = require('../models/User');
// Nạp hàm check email Super Admin để chặn xóa / đổi quyền tài khoản gốc.
const { isSuperAdminEmail } = require('../utils/superAdmin');

// Tạo router riêng cho nhóm user.
const router = express.Router();

// ----------------------------------------------------------------------------
// API: GET /api/users/profile
// CHỨC NĂNG: Lấy thông tin cá nhân của người đang đăng nhập.
// - Yêu cầu: có JWT hợp lệ (authMiddleware giải mã ra req.userId).
// - populate('enrolledClasses'): lấy kèm chi tiết các lớp đã tham gia.
// ----------------------------------------------------------------------------
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // Tìm user theo _id trong token, đồng thời nạp danh sách lớp đã ghi danh.
    const user = await User.findById(req.userId).populate('enrolledClasses');

    // Không thấy (có thể đã bị xóa) -> báo 404.
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Trả về toàn bộ document user (gồm cả password hash - frontend tự lọc nếu cần).
    res.json(user);
  } catch (error) {
    // Lỗi DB hoặc _id sai định dạng -> báo 500.
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/profile
// CHỨC NĂNG: Cập nhật hồ sơ cá nhân (tên, avatar, bio, phone).
// - Chỉ được sửa 4 trường an toàn này, KHÔNG cho tự đổi email/role/password ở đây.
// - Cập nhật updatedAt để biết lần sửa cuối.
// ----------------------------------------------------------------------------
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    // Bóc 4 trường cho phép sửa từ body.
    const { name, avatar, bio, phone } = req.body;
    // Tìm user đang đăng nhập.
    const user = await User.findById(req.userId);

    // Không thấy -> 404.
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Chỉ gán khi client có gửi giá trị (tránh ghi đè rỗng).
    if (name) user.name = name; // cập nhật họ tên.
    if (avatar) user.avatar = avatar; // cập nhật link ảnh đại diện.
    if (bio) user.bio = bio; // cập nhật giới thiệu bản thân.
    if (phone) user.phone = phone; // cập nhật số điện thoại.

    // Ghi nhận thời điểm sửa.
    user.updatedAt = new Date();
    // Lưu xuống DB (hook pre-save tự bỏ qua hash lại vì password không đổi).
    await user.save();

    // Trả về thông báo + user mới cho frontend hiển thị lại.
    res.json({ message: 'Profile updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// API: GET /api/users/:id
// CHỨC NĂNG: Lấy thông tin 1 user theo _id (ẩn password).
// - Yêu cầu đăng nhập. Dùng khi xem chi tiết giáo viên/học sinh.
// - select('-password'): loại mật khẩu khỏi kết quả để bảo mật.
// ----------------------------------------------------------------------------
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // Tìm theo _id trên URL, trừ trường password.
    const user = await User.findById(req.params.id).select('-password');

    // Không thấy -> 404.
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Trả về user an toàn (không có password).
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== KHU VỰC QUẢN TRỊ ADMIN (bắt buộc qua cả authMiddleware + adminOnly) =====

// ----------------------------------------------------------------------------
// API: GET /api/users
// CHỨC NĂNG: Lấy toàn bộ danh sách user để admin xem và cấp quyền.
// - Chỉ admin (kể cả Super Admin) mới gọi được.
// - select('-password'): ẩn mật khẩu. sort(createdAt: -1): mới nhất lên đầu.
// ----------------------------------------------------------------------------
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Lấy hết users, ẩn password, sắp xếp mới nhất trước.
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    // Trả mảng users cho trang quản trị frontend.
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/:id/role
// CHỨC NĂNG: Cấp / thu hồi quyền cho 1 tài khoản (lên admin hoặc xuống lại).
// - Body: { role: 'teacher' | 'student' | 'admin' }.
// - Super Admin gốc KHÔNG thể bị đổi quyền -> trả 403.
// - Sau khi cấp, user đó cần đăng nhập lại để nhận JWT role mới.
// ----------------------------------------------------------------------------
router.put('/:id/role', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Lấy role muốn gán từ body.
    const { role } = req.body;
    // Ràng buộc: chỉ 3 giá trị hợp lệ, chống gửi role lạ.
    if (!['teacher', 'student', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Quyền không hợp lệ (teacher/student/admin)' });
    }
    // Tìm tài khoản mục tiêu theo _id trên URL.
    const target = await User.findById(req.params.id);
    // Không thấy -> 404.
    if (!target) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    // Bảo vệ tài khoản gốc: nếu email là Super Admin thì cấm đổi quyền.
    if (isSuperAdminEmail(target.email)) {
      return res
        .status(403)
        .json({ message: 'Không thể thay đổi quyền của tài khoản quản trị mặc định' });
    }
    // Gán role mới cho target.
    target.role = role;
    // Cập nhật mốc thời gian sửa.
    target.updatedAt = new Date();
    // Lưu xuống DB (hook pre-save giữ nguyên, chỉ ép admin nếu là email gốc - ở đây đã chặn).
    await target.save();
    // Trả về thông báo + info gọn để frontend cập nhật bảng.
    res.json({
      message: `Đã cập nhật quyền thành ${role}`,
      user: { id: target._id, name: target.name, email: target.email, role: target.role },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// API: DELETE /api/users/:id
// CHỨC NĂNG: Xóa 1 tài khoản khỏi hệ thống.
// QUY TẮC AN TOÀN:
//  - Super Admin gốc KHÔNG thể bị xóa -> 403.
//  - Không thể tự xóa chính mình (tránh khóa luôn hệ thống) -> 400.
// ----------------------------------------------------------------------------
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Tìm tài khoản cần xóa.
    const target = await User.findById(req.params.id);
    // Không thấy -> 404.
    if (!target) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    // Chặn xóa tài khoản quản trị mặc định của website.
    if (isSuperAdminEmail(target.email)) {
      return res
        .status(403)
        .json({ message: 'Không thể xóa tài khoản quản trị mặc định' });
    }
    // Chặn tự xóa chính mình: so sánh _id target với userId trong token.
    if (target._id.toString() === req.userId) {
      return res.status(400).json({ message: 'Không thể tự xóa chính mình' });
    }
    // Xóa thật khỏi collection users.
    await User.deleteOne({ _id: target._id });
    // Báo thành công để frontend reload danh sách.
    res.json({ message: 'Đã xóa người dùng' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Xuất router để server.js gắn vào /api/users.
module.exports = router;
