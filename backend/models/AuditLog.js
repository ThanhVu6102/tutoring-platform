// ============================================================================
// FILE: backend/models/AuditLog.js
// MỤC ĐÍCH: Nhật ký thao tác quản trị (tương đương bảng audit_logs mục 3.14
// tài liệu luồng xử lý). Ghi lại "ai đã làm gì với đối tượng nào, khi nào".
// DÙNG CHO:
//  - Duyệt / từ chối hồ sơ giáo viên.
//  - Khóa / mở khóa tài khoản.
//  - Đổi vai trò, xóa (mềm) tài khoản.
//  - Thêm học sinh vào lớp.
// LƯU Ý: chỉ append, không sửa/xóa bản ghi log để giữ nguyên vết.
// ============================================================================

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Người thực hiện thao tác (admin hoặc giáo viên). Có thể null nếu hệ thống tự chạy.
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Mã hành động: 'approve_user', 'reject_user', 'block_user', 'unblock_user',
  // 'change_role', 'delete_user', 'enroll_student'...
  action: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  // Loại đối tượng bị tác động: 'user', 'class', 'quiz'...
  targetType: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  // ID đối tượng bị tác động.
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  // Dữ liệu cũ / mới dưới dạng JSONB tương đương (Mixed trong Mongo).
  oldData: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  newData: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Truy vấn nhanh: lịch sử theo actor hoặc theo đối tượng.
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
