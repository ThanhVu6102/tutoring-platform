// ============================================================================
// FILE: backend/routes/auth.js
// MỤC ĐÍCH: Xử lý Đăng ký (register) và Đăng nhập (login) của website.
// - Đăng ký public chỉ cho teacher/student, cấm tự đăng ký admin.
// - Mọi vai trò đăng nhập bằng hash trong DB, không bypass từ cấu hình.
// - Trả về JWT (hạn 7 ngày) + thông tin { id, name, email, role } cho frontend.
// ============================================================================

// Nạp thư viện express để tạo router (định nghĩa các API POST).
const express = require('express');
// Nạp jsonwebtoken để ký (sign) token đăng nhập cho client.
const jwt = require('jsonwebtoken');
const { requireJwtConfiguration } = require('../config/jwt');
// Nạp model User để truy vấn MongoDB (tìm user, tạo user mới).
const User = require('../models/User');
const StudentWarning = require('../models/StudentWarning');
const { isSuperAdminEmail } = require('../utils/superAdmin');
// Nạp hàm chuẩn hóa lỗi (trùng email, validation, ObjectId...) -> mã HTTP đúng.
const { sendError } = require('../utils/respond');

// Tạo router riêng cho nhóm API /api/auth.
const router = express.Router();
// Chặn trước khi đọc/ghi tài khoản, kể cả đăng ký giáo viên chưa cấp token.
router.use(requireJwtConfiguration);
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
      req.jwtSecret,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    // B6c: Trả về 201 (Created) kèm token + thông tin cơ bản để frontend lưu localStorage.
    res.status(201).json({
      message: 'Đăng ký thành công',
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
    console.error('Đăng ký thất bại:', error?.message || error);
    return sendError(res, error, 'Đăng ký thất bại, vui lòng thử lại');
  }
});

// ----------------------------------------------------------------------------
// API: POST /api/auth/login
// CHỨC NĂNG: Đăng nhập cho mọi vai trò (student/teacher/admin + Super Admin).
// Tìm tài khoản trong DB, so sánh bcrypt rồi kiểm tra trạng thái trước khi cấp JWT.
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
      req.jwtSecret,
      { expiresIn: '7d', algorithm: 'HS256' }
    );

    // Trả về token + info để frontend lưu và phân quyền hiển thị.
    res.json({
      message: 'Đăng nhập thành công',
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
    console.error('Đăng nhập thất bại:', error?.message || error);
    return sendError(res, error, 'Đăng nhập thất bại, vui lòng thử lại');
  }
});

// Xuất router để server.js gắn vào đường dẫn /api/auth.
module.exports = router;
