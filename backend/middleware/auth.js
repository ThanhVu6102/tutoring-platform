// ============================================================================
// FILE: backend/middleware/auth.js
// MỤC ĐÍCH: Các middleware (lớp gác cổng) bảo vệ API bằng JWT.
// - authMiddleware: bắt buộc đăng nhập (có token hợp lệ) mới qua được.
// - teacherOnly: chỉ giáo viên + admin được qua.
// - adminOnly: chỉ admin (kể cả Super Admin) được qua.
// CÁCH DÙNG: router.get('/', authMiddleware, adminOnly, handler)
// ============================================================================

// Nạp jsonwebtoken để giải mã và xác thực token do API login cấp.
const jwt = require('jsonwebtoken');
// Nạp model User để đối chiếu trạng thái mới nhất trong DB với token.
// (Token cũ có thể còn hạn 7 ngày dù admin vừa khóa / xóa / hạ quyền.)
const User = require('../models/User');

// ----------------------------------------------------------------------------
// MIDDLEWARE: authMiddleware(req, res, next)
// NHIỆM VỤ: Xác thực người dùng đã đăng nhập hay chưa.
// LUỒNG:
//  - B1: Lấy token từ header 'Authorization: Bearer <token>'.
//  - B2: Không có token -> trả 401 ngay.
//  - B3: Giải mã token bằng JWT_SECRET (phải khớp khóa lúc ký ở auth.js).
//  - B4: Gắn userId + userRole vào req để các handler phía sau dùng.
//  - B5: Token hết hạn / sai chữ ký -> trả 401.
//  - B6: Đối chiếu DB: user phải còn tồn tại, chưa xóa mềm, không bị khóa và
//        status là 'active' (hoặc admin) mới cho qua. Role lấy từ DB thay vì
//        token để chống token cũ leo quyền (mục 5.4/5.5 tài liệu luồng xử lý).
// ----------------------------------------------------------------------------
const authMiddleware = async (req, res, next) => {
  // B1: Đọc header Authorization, cắt tiền tố 'Bearer ' (không phân biệt hoa/thường).
  // Dùng ?. để không crash khi header vắng mặt.
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '').trim();

  // B2: Không gửi token -> chưa đăng nhập.
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let decoded;
  try {
    // B3: Giải mã + xác thực chữ ký token. Sai khóa / hết hạn sẽ ném lỗi.
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    // Token phải chứa userId và role hợp lệ thì mới xem xét tiếp.
    if (typeof decoded?.userId !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.userId)) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch (error) {
    // Token giả / hết hạn 7 ngày / sai secret -> chặn lại.
    return res.status(401).json({ message: 'Invalid token' });
  }

  try {
    // B6: Đối chiếu trạng thái tài khoản với DB (mục 5.5: kiểm tra quyền ở backend).
    const user = await User.findById(decoded.userId)
      .select('role status isBlocked deletedAt suspendedUntil permanentlyBanned').lean();

    // Không còn trong DB hoặc đã xóa mềm -> token cũ không còn giá trị.
    if (!user || user.deletedAt) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (user.permanentlyBanned) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa vĩnh viễn do tái phạm chính sách.' });
    }
    if (user.suspendedUntil && user.suspendedUntil > new Date()) {
      return res.status(423).json({ message: 'Tài khoản đang bị đình chỉ.', suspendedUntil: user.suspendedUntil });
    }
    // Bị khóa -> chặn 403 nhắc lý do.
    if (user.isBlocked) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa, liên hệ quản trị viên' });
    }
    // Chỉ 'active' (hoặc admin) được giữ phiên. Lưu: token cũ khi user bị
    // chuyển 'inactive'/'left'/'rejected' cũng tự mất quyền mà không cần chờ hết hạn.
    // Tài khoản trên main trước khi thêm vòng đời chưa có trường status.
    if ((user.status || 'active') !== 'active' || !['teacher', 'student', 'admin'].includes(user.role)) {
      return res.status(403).json({ message: 'Tài khoản đang không hoạt động, vui lòng đăng nhập lại' });
    }

    // Gắn danh tính + role MỚI NHẤT từ DB để handler/middleware phía sau dùng.
    req.userId = decoded.userId;
    req.userRole = user.role;
    // Qua cổng, cho chạy tiếp tới handler chính.
    next();
  } catch (error) {
    // Lỗi DB (mất kết nối...) -> 500, không xem như sai token.
    console.error('authMiddleware DB error:', error?.message || error);
    return res.status(500).json({ message: 'Lỗi xác thực, vui lòng thử lại' });
  }
};

// ----------------------------------------------------------------------------
// MIDDLEWARE: teacherOnly(req, res, next)
// NHIỆM VỤ: Chỉ giáo viên và admin được thao tác (tạo lớp, đăng tài liệu...).
// - Yêu cầu chạy SAU authMiddleware (đã có req.userRole).
// - Học sinh (student) gọi vào -> 403.
// ----------------------------------------------------------------------------
const teacherOnly = (req, res, next) => {
  // Kiểm tra role: phải là teacher HOẶC admin (admin có mọi quyền giáo viên).
  if (req.userRole !== 'teacher' && req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Only teachers can access this' });
  }
  // Đủ quyền -> cho qua.
  next();
};

// ----------------------------------------------------------------------------
// MIDDLEWARE: adminOnly(req, res, next)
// NHIỆM VỤ: Chỉ admin (gồm Super Admin gốc + admin được cấp) được qua.
// - Dùng cho: GET /api/users, PUT /:id/role, DELETE /:id.
// - student/teacher gọi vào -> 403.
// ----------------------------------------------------------------------------
const adminOnly = (req, res, next) => {
  // Role phải đúng 'admin', còn lại chặn hết.
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Only admins can access this' });
  }
  // Là admin -> cho qua.
  next();
};

// Xuất 3 middleware để các file routes require() và gắn vào API.
module.exports = { authMiddleware, teacherOnly, adminOnly };
