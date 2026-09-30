// ============================================================================
// FILE: backend/routes/auth.js
// MỤC ĐÍCH: Xử lý Đăng ký (register) và Đăng nhập (login) của website.
// - Đăng ký public chỉ cho teacher/student, cấm tự đăng ký admin.
// - Đăng nhập Super Admin gốc luôn hoạt động với TK cố định trong config.
// - Trả về JWT (hạn 7 ngày) + thông tin { id, name, email, role } cho frontend.
// ============================================================================

// Nạp thư viện express để tạo router (định nghĩa các API POST).
const express = require('express');
// Nạp jsonwebtoken để ký (sign) token đăng nhập cho client.
const jwt = require('jsonwebtoken');
// Nạp model User để truy vấn MongoDB (tìm user, tạo user mới).
const User = require('../models/User');
// Nạp cấu hình admin cố định (email/password mặc định của Super Admin).
const DEFAULT_ADMIN = require('../config/defaultAdmin');
// Nạp 3 hàm tiện ích Super Admin: check email, check password, (ensure dự phòng).
const {
  isSuperAdminEmail,
  isSuperAdminPassword,
  ensureSuperAdmin,
} = require('../utils/superAdmin');

// Tạo router riêng cho nhóm API /api/auth.
const router = express.Router();

// ----------------------------------------------------------------------------
// API: POST /api/auth/register
// CHỨC NĂNG: Đăng ký tài khoản mới cho học sinh / giáo viên.
// LUỒNG XỬ LÝ:
//  - B1: Lấy name, email, password, role từ body request.
//  - B2: Kiểm tra thiếu họ tên/email/mật khẩu -> báo lỗi 400.
//  - B3: Chặn đăng ký trùng email Super Admin gốc -> báo lỗi 400.
//  - B4: Kiểm tra email đã tồn tại trong DB chưa -> báo lỗi nếu trùng.
//  - B5: Tạo user mới (role chỉ nhận teacher/student, còn lại ép về student).
//  - B6: Lưu DB (password tự hash ở model), ký JWT và trả về cho frontend.
// ----------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    // B1: Bóc dữ liệu người dùng gửi lên từ form đăng ký.
    const { name, email, password, role } = req.body;

    // B2: Ràng buộc bắt buộc: phải có đủ họ tên + email + mật khẩu.
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu' });
    }

    // B3: Bảo vệ Super Admin: không cho ai đăng ký chiếm email admin gốc.
    if (isSuperAdminEmail(email)) {
      return res.status(400).json({ message: 'Email này là tài khoản quản trị mặc định, không thể đăng ký' });
    }

    // B4: Tìm trong DB xem email đã được dùng chưa.
    const existingUser = await User.findOne({ email });
    // Nếu đã tồn tại -> không cho tạo trùng, báo lỗi cho frontend hiện thông báo.
    if (existingUser) {
      return res.status(400).json({ message: 'Email này đã được đăng ký' });
    }

    // B5: Tạo document user mới. Role public chỉ cho phép teacher/student,
    // nếu client gửi 'admin' hoặc giá trị lạ thì ép về 'student' để chống leo quyền.
    const user = new User({
      name,
      email,
      password, // mật khẩu thô, sẽ được hash trong hook pre-save của model.
      role: ['teacher', 'student'].includes(role) ? role : 'student',
    });

    // B6a: Lưu user mới xuống MongoDB.
    await user.save();

    // B6b: Ký JWT chứa userId + role, hạn 7 ngày để duy trì đăng nhập.
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key', // khóa bí mật, nên đặt JWT_SECRET trên env.
      { expiresIn: '7d' }
    );

    // B6c: Trả về 201 (Created) kèm token + thông tin cơ bản để frontend lưu localStorage.
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    // Nhánh lỗi: in log server để debug.
    console.error('Register failed:', error?.message || error);
    // Nếu lỗi validation của mongoose (thiếu trường, sai enum...) -> báo 400.
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ: ' + error.message });
    }
    // Lỗi còn lại -> báo 500.
    res.status(500).json({ message: error.message });
  }
});

// ----------------------------------------------------------------------------
// API: POST /api/auth/login
// CHỨC NĂNG: Đăng nhập cho mọi vai trò (student/teacher/admin + Super Admin).
// THỨ TỰ ƯU TIÊN:
//  - Nhánh 1 (SUPER ADMIN GỐC): đúng email + mật khẩu cố định -> vào ngay,
//    tự tạo/khôi phục record admin trong DB, cấp token role admin.
//  - Nhánh 2 (TƯƠNG THÍCH ENV CŨ): đúng ADMIN_EMAIL + ADMIN_PASSWORD trên env.
//  - Nhánh 3 (THƯỜNG): tìm user trong DB rồi so sánh mật khẩu bcrypt.
//  - Chặn: email Super Admin mà sai mật khẩu -> 401 ngay, không dò tiếp.
// ----------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    // Lấy email + password từ form đăng nhập của frontend.
    const { email, password } = req.body;

    // ===== NHÁNH 1: SUPER ADMIN GỐC (tài khoản mặc định của website) =====
    // Điều kiện: email trùng email gốc (không phân biệt hoa/thường)
    //         VÀ password khớp mật khẩu cố định (hoặc ADMIN_PASSWORD trên env).
    if (isSuperAdminEmail(email) && isSuperAdminPassword(password)) {
      // Tìm record admin gốc trong DB theo email chuẩn chữ thường.
      let adminUser = await User.findOne({ email: DEFAULT_ADMIN.email.toLowerCase() });
      // Trường hợp 1a: Chưa có trong DB (DB mới, chưa seed) -> tạo mới.
      if (!adminUser) {
        adminUser = new User({
          // Tên lấy từ env ADMIN_NAME nếu có, còn không lấy tên mặc định.
          name: process.env.ADMIN_NAME || DEFAULT_ADMIN.name,
          email: DEFAULT_ADMIN.email.toLowerCase(),
          password, // mật khẩu vừa nhập (đã xác thực đúng) -> pre-save sẽ hash.
          role: 'admin', // cố định quyền cao nhất.
        });
        // Lưu admin mới xuống DB.
        await adminUser.save();
      } else {
        // Trường hợp 1b: Đã có trong DB -> đồng bộ lại cho đúng chuẩn.
        let changed = false; // cờ theo dõi có gì thay đổi để quyết định save().
        // Ép role về admin nếu trước đó bị sửa sai.
        if (adminUser.role !== 'admin') {
          adminUser.role = 'admin';
          changed = true;
        }
        // So sánh mật khẩu vừa nhập với hash trong DB; nếu lệch thì cập nhật lại.
        if (!(await adminUser.comparePassword(password))) {
          adminUser.password = password;
          changed = true;
        }
        // Đồng bộ tên hiển thị theo env hoặc tên mặc định.
        const desiredName = process.env.ADMIN_NAME || DEFAULT_ADMIN.name;
        if (adminUser.name !== desiredName) {
          adminUser.name = desiredName;
          changed = true;
        }
        // Chỉ lưu khi có thay đổi.
        if (changed) await adminUser.save();
      }

      // Ký JWT role admin cho Super Admin để đi qua middleware adminOnly.
      const token = jwt.sign(
        { userId: adminUser._id, role: 'admin' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      // Trả về token + info admin cho frontend chuyển vào Dashboard.
      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: 'admin',
        },
      });
    }

    // ===== NHÁNH 2: ADMIN ENV CŨ (giữ tương thích nếu deploy đặt ADMIN_EMAIL khác) =====
    // Chỉ chạy khi có đủ 2 biến env và email/password gửi lên khớp tuyệt đối.
    if (
      process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD &&
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      // Tìm admin env trong DB.
      let adminUser = await User.findOne({ email });
      // Chưa có -> tạo mới role admin.
      if (!adminUser) {
        adminUser = new User({
          name: process.env.ADMIN_NAME || 'Quản trị viên',
          email,
          password,
          role: 'admin',
        });
        await adminUser.save();
      } else {
        // Đã có -> ép role admin + đồng bộ password/name theo env.
        let changed = false;
        if (adminUser.role !== 'admin') {
          adminUser.role = 'admin';
          changed = true;
        }
        // Đồng bộ password theo env để env luôn là nguồn đúng duy nhất của nhánh này.
        if (!(await adminUser.comparePassword(password))) {
          adminUser.password = password;
          changed = true;
        }
        if (process.env.ADMIN_NAME && adminUser.name !== process.env.ADMIN_NAME) {
          adminUser.name = process.env.ADMIN_NAME;
          changed = true;
        }
        if (changed) await adminUser.save();
      }

      // Ký token admin cho nhánh env.
      const token = jwt.sign(
        { userId: adminUser._id, role: 'admin' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      // Trả về cho frontend.
      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: 'admin',
        },
      });
    }

    // ===== CHẶN DÒ MẬT KHẨU SUPER ADMIN =====
    // Nếu email là của Super Admin mà đã lọt qua 2 nhánh trên (tức sai mật khẩu)
    // thì báo 401 ngay, không cho dò tiếp xuống nhánh thường để tránh lộ thông tin.
    if (isSuperAdminEmail(email)) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // ===== NHÁNH 3: ĐĂNG NHẬP THƯỜNG (student/teacher/admin phụ) =====
    // Tìm user trong DB theo email.
    const user = await User.findOne({ email });
    // Không thấy -> báo sai email hoặc mật khẩu (không nói rõ cái nào để bảo mật).
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // So sánh mật khẩu nhập vào với hash bcrypt trong DB.
    const isPasswordCorrect = await user.comparePassword(password);
    // Sai mật khẩu -> báo 401.
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // Đúng cả hai -> ký JWT với role thật trong DB.
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    // Trả về token + info để frontend lưu và phân quyền hiển thị.
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    // Lỗi hệ thống (mất DB, lỗi ký token...) -> báo 500.
    res.status(500).json({ message: error.message });
  }
});

// Xuất router để server.js gắn vào đường dẫn /api/auth.
module.exports = router;
