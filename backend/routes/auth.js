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
const StudentWarning = require('../models/StudentWarning');
// Nạp cấu hình admin cố định (email/password mặc định của Super Admin).
const DEFAULT_ADMIN = require('../config/defaultAdmin');
// Nạp 3 hàm tiện ích Super Admin: check email, check password, (ensure dự phòng).
const {
  isSuperAdminEmail,
  isSuperAdminPassword,
  ensureSuperAdmin,
} = require('../utils/superAdmin');
// Nạp hàm chuẩn hóa lỗi (trùng email, validation, ObjectId...) -> mã HTTP đúng.
const { sendError } = require('../utils/respond');

// Tạo router riêng cho nhóm API /api/auth.
const router = express.Router();
const POLICY_VERSION = '0.1.1';

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
    // B1: Bóc + chuẩn hóa dữ liệu người dùng gửi lên từ form đăng ký.
    const { password, role, acceptedPolicies } = req.body;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    // B2: Ràng buộc bắt buộc: phải có đủ họ tên + email + mật khẩu.
    if (!name || !email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu' });
    }
    if (acceptedPolicies !== true) {
      return res.status(400).json({ message: 'Bạn cần đọc và đồng ý với chính sách trước khi đăng ký' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length > 200 || email.length > 255) {
      return res.status(400).json({ message: 'Họ tên hoặc email không hợp lệ' });
    }
    // bcrypt chỉ xử lý tối đa 72 byte; không để hai mật khẩu dài có cùng tiền tố.
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ message: 'Mật khẩu cần ít nhất 8 ký tự và không vượt quá 72 byte' });
    }

    // B3: Bảo vệ Super Admin: không cho ai đăng ký chiếm email admin gốc.
    if (isSuperAdminEmail(email)) {
      return res.status(400).json({ message: 'Email này là tài khoản quản trị mặc định, không thể đăng ký' });
    }

    // B4: Tìm trong DB xem email đã được dùng chưa (email đã chuẩn hóa lowercase).
    // Dùng exists() thay vì findOne() để không tải cả document -> nhanh hơn.
    const existingUser = await User.exists({ email });
    // Nếu đã tồn tại -> không cho tạo trùng, báo lỗi cho frontend hiện thông báo.
    if (existingUser) {
      return res.status(400).json({ message: 'Email này đã được đăng ký' });
    }

    // B5: Tạo document user mới. Role public chỉ cho phép teacher/student,
    // nếu client gửi 'admin' hoặc giá trị lạ thì ép về 'student' để chống leo quyền.
    // Vòng đời theo tài liệu (mục 5.1): giáo viên phải qua admin duyệt nên bắt đầu
    // ở 'pending'; học sinh được kích hoạt ngay. Mật khẩu bắt buộc ngay khi đăng ký
    // nên password_hash luôn có, không cần bước kích hoạt riêng.
    const user = new User({
      name,
      email,
      password, // mật khẩu thô, sẽ được hash trong hook pre-save của model.
      role: ['teacher', 'student'].includes(role) ? role : 'student',
      policiesAcceptedAt: new Date(),
      policyVersion: POLICY_VERSION,
      status: role === 'teacher' ? 'pending' : 'active',
    });

    // B6a: Lưu user mới xuống MongoDB.
    await user.save();

    // B6b: Ký JWT chứa userId + role, hạn 7 ngày để duy trì đăng nhập.
    // LƯU Ý (mục 5.1): chỉ trả token cho student nếu muốn đăng nhập luôn;
    // giáo viên 'pending' KHÔNG cấp token, phải chờ admin duyệt rồi đăng nhập lại.
    if (user.status === 'pending') {
      return res.status(202).json({
        message: 'Đăng ký thành công. Hồ sơ giáo viên đang chờ quản trị viên duyệt, vui lòng đăng nhập lại sau khi được duyệt.',
        user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
      });
    }

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
    // Nhánh lỗi: sendError tự phân loại validation/trùng email -> 400/409.
    console.error('Register failed:', error?.message || error);
    return sendError(res, error, 'Đăng ký thất bại, vui lòng thử lại');
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
    // Lấy + chuẩn hóa email từ form đăng nhập của frontend.
    const { password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    // Chặn sớm dữ liệu thiếu/sai kiểu: tránh truy vấn rỗng và lỗi bcrypt 500.
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu' });
    }

    // ===== NHÁNH 1: SUPER ADMIN GỐC (tài khoản mặc định của website) =====
    // Điều kiện: email trùng email gốc (không phân biệt hoa/thường)
    //         VÀ password khớp mật khẩu cố định (hoặc ADMIN_PASSWORD trên env).
    if (isSuperAdminEmail(email) && isSuperAdminPassword(password)) {
      // Tìm record admin gốc trong DB theo email chuẩn chữ thường.
      // .select('+password') vì model User mặc định ẩn password_hash.
      let adminUser = await User.findOne({ email: DEFAULT_ADMIN.email.toLowerCase() }).select('+password');
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
      let adminUser = await User.findOne({ email }).select('+password');
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
    // Cần +password để bcrypt so sánh (model mặc định ẩn trường này).
    const user = await User.findOne({ email }).select('+password');
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

    if (user.deletedAt) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }
    if (user.permanentlyBanned) {
      const latestWarning = await StudentWarning.findOne({ student: user._id, violationCounted: true })
        .populate('class', 'name')
        .sort({ resolvedAt: -1 });
      return res.status(403).json({
        message: 'Tài khoản đã bị khóa vĩnh viễn do tái phạm chính sách.',
        restriction: latestWarning ? {
          className: latestWarning.class?.name,
          reasonCode: latestWarning.reasonCode,
          details: latestWarning.details,
          sanction: 'Khóa tài khoản vĩnh viễn',
        } : undefined,
      });
    }
    if (user.suspendedUntil && user.suspendedUntil > new Date()) {
      const latestWarning = await StudentWarning.findOne({ student: user._id, accountSanction: { $ne: 'none' } })
        .populate('class', 'name')
        .sort({ resolvedAt: -1 });
      return res.status(423).json({
        message: 'Tài khoản đang bị đình chỉ.',
        suspendedUntil: user.suspendedUntil,
        restriction: latestWarning ? {
          className: latestWarning.class?.name,
          reasonCode: latestWarning.reasonCode,
          details: latestWarning.details,
          sanction: latestWarning.accountSanction === 'suspension_7_days' ? 'Đình chỉ 7 ngày' : 'Đình chỉ 1 tháng',
        } : undefined,
      });
    }
    // ===== KIỂM TRA VÒNG ĐỜI TÀI KHOẢN (mục 5.4 tài liệu) =====
    // Chỉ thực hiện sau khi mật khẩu đúng để không tiết lộ trạng thái cho người dò.
    // B2: Bị khóa đăng nhập -> 403 kèm lý do rõ ràng.
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa, liên hệ quản trị viên' });
    }
    // B3: Chưa được duyệt / đã từ chối / tạm nghỉ -> chặn kèm trạng thái cụ thể.
    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Tài khoản đang chờ quản trị viên duyệt' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'Hồ sơ của bạn đã bị từ chối' });
    }
    if (user.status === 'inactive' || user.status === 'left') {
      return res.status(403).json({ message: `Tài khoản đang ở trạng thái ${user.status}, không thể đăng nhập` });
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
    // Lỗi hệ thống (mất DB, lỗi ký token...) -> log + trả thông báo an toàn.
    console.error('Login failed:', error?.message || error);
    return sendError(res, error, 'Đăng nhập thất bại, vui lòng thử lại');
  }
});

// Xuất router để server.js gắn vào đường dẫn /api/auth.
module.exports = router;
