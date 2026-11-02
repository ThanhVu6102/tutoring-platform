// ============================================================================
// FILE: backend/routes/users.js
// MỤC ĐÍCH: API quản lý người dùng theo vòng đời tài khoản (tài liệu luồng xử
// lý mục 4, 5.2, 5.4, 6.2, 7.3):
// - Mọi user đăng nhập đều xem/sửa được profile của chính mình.
// - Chỉ admin mới được list user, duyệt hồ sơ giáo viên, khóa/mở khóa,
//   cấp/thu hồi quyền, xóa (mềm) user.
// - Mọi thao tác quản trị ghi audit_logs để còn dấu vết ai đã thay đổi gì.
// - Super Admin gốc (admin@eklasses.vn) KHÔNG thể bị xóa, khóa hay đổi quyền.
// ============================================================================

// Nạp express để tạo router cho nhóm /api/users.
const express = require('express');
// Nạp 2 middleware: authMiddleware (kiểm tra JWT + trạng thái DB) và adminOnly.
const { authMiddleware, adminOnly } = require('../middleware/auth');
// Nạp model User để truy vấn MongoDB.
const User = require('../models/User');
// Nạp helper ghi nhật ký quản trị.
const { writeAudit } = require('../utils/audit');
// Nạp hàm check email Super Admin để chặn xóa / khóa / đổi quyền tài khoản gốc.
const { isSuperAdminEmail } = require('../utils/superAdmin');
// Nạp hàm chuẩn hóa lỗi -> mã HTTP đúng.
const { sendError } = require('../utils/respond');

// Tạo router riêng cho nhóm user.
const router = express.Router();

// ----------------------------------------------------------------------------
// API: GET /api/users/profile
// CHỨC NĂNG: Lấy thông tin cá nhân của người đang đăng nhập.
// - select('-password'): KHÔNG trả hash mật khẩu về client (mục 5.4 tài liệu).
// ----------------------------------------------------------------------------
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    // Tìm user theo _id trong token, nạp kèm danh sách lớp đã ghi danh, ẩn password.
    const user = await User.findOne({
      _id: req.userId,
      deletedAt: null, // chỉ nhìn thấy chính mình khi chưa bị xóa mềm.
    })
      .select('-password')
      .populate('enrolledClasses', 'name subject grade');

    // Không thấy (có thể đã bị xóa mềm) -> 404.
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Trả về user an toàn (không có password).
    res.json(user);
  } catch (error) {
    // Lỗi DB hoặc _id sai định dạng -> báo 500.
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/profile
// CHỨC NĂNG: Cập nhật hồ sơ cá nhân (tên, avatar, bio, phone).
// - Chỉ được sửa 4 trường an toàn này, KHÔNG cho tự đổi email/role/password ở đây.
// ----------------------------------------------------------------------------
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    // Bóc 4 trường cho phép sửa từ body.
    const { name, avatar, bio, phone } = req.body;
    // Tìm user đang đăng nhập (chưa xóa mềm).
    const user = await User.findOne({ _id: req.userId, deletedAt: null });

    // Không thấy -> 404.
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (avatar !== undefined && avatar) {
      if (typeof avatar !== 'string') {
        return res.status(400).json({ message: 'Avatar phải là chuỗi URL hoặc ảnh base64' });
      }
      if (avatar.startsWith('data:image/')) {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(avatar) || avatar.length > 3_000_000) {
          return res.status(400).json({ message: 'Avatar must be PNG, JPG or WebP and smaller than 2 MB' });
        }
      } else {
        try {
          const avatarUrl = new URL(avatar);
          if (!['http:', 'https:'].includes(avatarUrl.protocol)) {
            return res.status(400).json({ message: 'Avatar URL must use HTTP or HTTPS' });
          }
        } catch (_) {
          return res.status(400).json({ message: 'Avatar URL is invalid' });
        }
      }
    }

    // Chỉ gán khi client có gửi giá trị (tránh ghi đè rỗng).
    if (name) user.name = name; // cập nhật họ tên.
    if (avatar !== undefined) user.avatar = avatar; // cập nhật hoặc xóa ảnh.
    if (bio) user.bio = bio; // cập nhật giới thiệu bản thân.
    if (phone) user.phone = phone; // cập nhật số điện thoại.

    // Ghi nhận thời điểm sửa.
    user.updatedAt = new Date();
    // Lưu xuống DB (hook pre-save tự bỏ qua hash lại vì password không đổi).
    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        phone: user.phone,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: GET /api/users/:id
// CHỨC NĂNG: Lấy thông tin 1 user theo _id (ẩn password).
// - Yêu cầu đăng nhập. Dùng khi xem chi tiết giáo viên/học sinh.
// - Bị xóa mềm -> coi như không tồn tại (404).
// ----------------------------------------------------------------------------
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // Tìm theo _id trên URL, trừ trường password, loại bản ghi đã xóa mềm.
    const user = await User.findOne({ _id: req.params.id, deletedAt: null }).select('-password');

    // Không thấy -> 404.
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Trả về user an toàn (không có password).
    res.json(user);
  } catch (error) {
    return sendError(res, error);
  }
});

// ===== KHU VỰC QUẢN TRỊ ADMIN (bắt buộc qua cả authMiddleware + adminOnly) =====

// ----------------------------------------------------------------------------
// API: GET /api/users?page=1&limit=20&search=&role=&status=
// CHỨC NĂNG: Danh sách user cho admin, có phân trang + tìm kiếm (mục 6.2 tài liệu).
// - Luôn loại bỏ user đã xóa mềm (deletedAt IS NULL).
// - Tương thích ngược: KHÔNG truyền page/limit -> trả mảng như trước để frontend
//   cũ không vỡ; có truyền page/limit -> trả { data, page, limit, total, totalPages }.
// ----------------------------------------------------------------------------
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Đọc tham số phân trang/lọc từ query.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitRaw = req.query.limit === undefined ? null : Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    // Dựng điều kiện lọc trên DB: luôn ẩn bản ghi đã xóa mềm.
    const filter = { deletedAt: null };
    // Lọc theo role nếu hợp lệ.
    if (['teacher', 'student', 'admin'].includes(role)) filter.role = role;
    // Lọc theo trạng thái nếu hợp lệ.
    if (['pending', 'active', 'inactive', 'left', 'rejected'].includes(status)) filter.status = status;
    // Tìm kiếm theo tên hoặc email (không phân biệt hoa/thường, không regex injection).
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Không yêu cầu phân trang -> giữ hành vi cũ: trả mảng toàn bộ (đã ẩn password).
    if (limitRaw === null) {
      const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
      return res.json(users);
    }

    // Pagination thật: tổng số dòng cần lọc trước, rồi lấy đúng 1 trang.
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limitRaw)
      .limit(limitRaw);

    res.json({
      data: users,
      page,
      limit: limitRaw,
      total,
      totalPages: Math.ceil(total / limitRaw),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/:id/approve  (mục 5.2 tài liệu: admin duyệt hồ sơ)
// CHỨC NĂNG: Duyệt hồ sơ giáo viên đang 'pending'.
// - Duyệt là CẬP NHẬT trạng thái, không tạo tài khoản mới.
// - Chỉ duyệt khi tài khoản đang ở trạng thái chờ.
// - Ghi audit log với người duyệt + thời điểm.
// ----------------------------------------------------------------------------
router.put('/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Tìm tài khoản mục tiêu.
    const target = await require('../utils/reviewTeacher').reviewTeacher({
      userId: req.params.id, actorId: req.userId, status: 'active',
    });
    // Không thấy -> 404.
    if (!target) {
      return res.status(409).json({ message: 'Không có hồ sơ giáo viên đang chờ duyệt hoặc hồ sơ đã được xử lý' });
    }
    const oldData = { status: 'pending' };

    // Ghi audit log sau khi commit thành công (mục 5.2: ghi lại người duyệt).
    await writeAudit({
      actorId: req.userId,
      action: 'approve_user',
      targetType: 'user',
      targetId: target._id,
      oldData,
      newData: { status: 'active' },
    });

    res.json({
      message: 'Đã duyệt hồ sơ giáo viên',
      user: { id: target._id, name: target.name, email: target.email, role: target.role, status: target.status },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/:id/reject  (mục 5.2: admin từ chối hồ sơ)
// CHỨC NĂNG: Từ chối hồ sơ giáo viên đang 'pending' -> trạng thái 'rejected'.
// - Body tùy chọn: { note } ghi chú lý do từ chối (chỉ lưu vào audit log).
// ----------------------------------------------------------------------------
router.put('/:id/reject', authMiddleware, adminOnly, async (req, res) => {
  try {
    if (req.body.note !== undefined && (typeof req.body.note !== 'string' || req.body.note.length > 2000)) {
      return res.status(400).json({ message: 'Ghi chú phải là chuỗi tối đa 2000 ký tự' });
    }
    // Tìm tài khoản mục tiêu.
    const target = await require('../utils/reviewTeacher').reviewTeacher({
      userId: req.params.id, actorId: req.userId, status: 'rejected', note: req.body.note,
    });
    if (!target) {
      return res.status(409).json({ message: 'Không có hồ sơ giáo viên đang chờ duyệt hoặc hồ sơ đã được xử lý' });
    }
    const oldData = { status: 'pending' };

    await writeAudit({
      actorId: req.userId,
      action: 'reject_user',
      targetType: 'user',
      targetId: target._id,
      oldData,
      newData: { status: 'rejected', note: typeof req.body.note === 'string' ? req.body.note : '' },
    });

    res.json({
      message: 'Đã từ chối hồ sơ giáo viên',
      user: { id: target._id, name: target.name, email: target.email, role: target.role, status: target.status },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/:id/block
// CHỨC NĂNG: Khóa đăng nhập một tài khoản (isBlocked = true) - mục 3.1 tài liệu.
// - Cờ khóa tách riêng khỏi status: mở khóa không đổi status.
// - Super Admin gốc không thể bị khóa.
// ----------------------------------------------------------------------------
router.put('/:id/block', authMiddleware, adminOnly, async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!target) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
    // Bảo vệ tài khoản quản trị mặc định.
    if (isSuperAdminEmail(target.email)) {
      return res.status(403).json({ message: 'Không thể khóa tài khoản quản trị mặc định' });
    }
    // Không khóa chính mình (tránh tự mất quyền kiểm soát).
    if (target._id.toString() === req.userId) {
      return res.status(400).json({ message: 'Không thể tự khóa chính mình' });
    }

    const oldData = { isBlocked: target.isBlocked };
    target.isBlocked = true;
    target.updatedAt = new Date();
    await target.save();

    await writeAudit({
      actorId: req.userId,
      action: 'block_user',
      targetType: 'user',
      targetId: target._id,
      oldData,
      newData: { isBlocked: true },
    });

    res.json({
      message: 'Đã khóa tài khoản',
      user: { id: target._id, name: target.name, isBlocked: target.isBlocked },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/:id/unblock
// CHỨC NĂNG: Mở khóa đăng nhập (isBlocked = false).
// ----------------------------------------------------------------------------
router.put('/:id/unblock', authMiddleware, adminOnly, async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!target) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    const oldData = { isBlocked: target.isBlocked };
    target.isBlocked = false;
    target.updatedAt = new Date();
    await target.save();

    await writeAudit({
      actorId: req.userId,
      action: 'unblock_user',
      targetType: 'user',
      targetId: target._id,
      oldData,
      newData: { isBlocked: false },
    });

    res.json({
      message: 'Đã mở khóa tài khoản',
      user: { id: target._id, name: target.name, isBlocked: target.isBlocked },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: PUT /api/users/:id/role
// CHỨC NĂNG: Cấp / thu hồi quyền cho 1 tài khoản.
// - Body: { role: 'teacher' | 'student' | 'admin' }.
// - Super Admin gốc KHÔNG thể bị đổi quyền -> trả 403.
// - Ghi audit log.
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
    // Lưu role cũ cho audit log.
    const oldData = { role: target.role };
    // Gán role mới cho target.
    target.role = role;
    // Cập nhật mốc thời gian sửa.
    target.updatedAt = new Date();
    // Lưu xuống DB.
    await target.save();

    // Ghi audit log thao tác đổi quyền.
    await writeAudit({
      actorId: req.userId,
      action: 'change_role',
      targetType: 'user',
      targetId: target._id,
      oldData,
      newData: { role },
    });

    // Trả về thông báo + info gọn để frontend cập nhật bảng.
    res.json({
      message: `Đã cập nhật quyền thành ${role}`,
      user: { id: target._id, name: target.name, email: target.email, role: target.role },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: DELETE /api/users/:id
// CHỨC NĂNG: Xóa (mềm) 1 tài khoản - mục 7.3 tài liệu.
// QUY TẮC AN TOÀN:
//  - Super Admin gốc KHÔNG thể bị xóa -> 403.
//  - Không thể tự xóa chính mình (tránh khóa luôn hệ thống) -> 400.
//  - Chỉ đặt deletedAt = NOW(), KHÔNG xóa cứng: giữ nguyên lịch sử lớp, nộp bài...
// ----------------------------------------------------------------------------
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Tìm tài khoản cần xóa (chưa xóa mềm).
    const target = await User.findOne({ _id: req.params.id, deletedAt: null });
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

    // Xóa mềm: chỉ đánh dấu thời điểm xóa, dữ liệu được giữ nguyên vẹn.
    target.deletedAt = new Date();
    target.updatedAt = new Date();
    await target.save();

    // Ghi audit log thao tác xóa.
    await writeAudit({
      actorId: req.userId,
      action: 'delete_user',
      targetType: 'user',
      targetId: target._id,
      oldData: { status: target.status, role: target.role },
      newData: { deletedAt: target.deletedAt },
    });

    // Báo thành công để frontend reload danh sách.
    res.json({ message: 'Đã xóa người dùng' });
  } catch (error) {
    return sendError(res, error);
  }
});

// ----------------------------------------------------------------------------
// API: GET /api/users/:id/audit-logs
// CHỨC NĂNG: Xem lịch sử thao tác quản trị liên quan 1 user (chỉ admin).
// ----------------------------------------------------------------------------
router.get('/:id/audit-logs', authMiddleware, adminOnly, async (req, res) => {
  try {
    // Lấy tối đa 100 log gần nhất theo đối tượng bị tác động.
    const logs = await require('../models/AuditLog')
      .find({ targetType: 'user', targetId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('actorId action oldData newData createdAt');
    res.json(logs);
  } catch (error) {
    return sendError(res, error);
  }
});

// Xuất router để server.js gắn vào /api/users.
module.exports = router;
