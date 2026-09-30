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

// ----------------------------------------------------------------------------
// MIDDLEWARE: authMiddleware(req, res, next)
// NHIỆM VỤ: Xác thực người dùng đã đăng nhập hay chưa.
// LUỒNG:
//  - B1: Lấy token từ header 'Authorization: Bearer <token>'.
//  - B2: Không có token -> trả 401 ngay.
//  - B3: Giải mã token bằng JWT_SECRET (phải khớp khóa lúc ký ở auth.js).
//  - B4: Gắn userId + userRole vào req để các handler phía sau dùng.
//  - B5: Token hết hạn / sai chữ ký -> trả 401.
// ----------------------------------------------------------------------------
const authMiddleware = (req, res, next) => {
  // B1: Đọc header Authorization, cắt bỏ tiền tố 'Bearer ' để lấy token thô.
  // Dùng ?. để không crash khi header vắng mặt.
  const token = req.header('Authorization')?.replace('Bearer ', '');

  // B2: Không gửi token -> chưa đăng nhập.
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // B3: Giải mã + xác thực chữ ký token. Sai khóa / hết hạn sẽ ném lỗi.
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    // B4a: Lưu _id user vào request để handler biết đang là ai.
    req.userId = decoded.userId;
    // B4b: Lưu role (student/teacher/admin) để middleware phân quyền phía sau dùng.
    req.userRole = decoded.role;
    // B5: Qua cổng, cho chạy tiếp tới handler chính.
    next();
  } catch (error) {
    // Token giả / hết hạn 7 ngày / sai secret -> chặn lại.
    return res.status(401).json({ message: 'Invalid token' });
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
