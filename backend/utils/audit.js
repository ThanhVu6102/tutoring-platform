// ============================================================================
// FILE: backend/utils/audit.js
// MỤC ĐÍCH: Helper ghi audit log ngắn gọn cho các thao tác quản trị.
// - Vượt cước: "ai" (actorId) "làm gì" (action) "trên gì" (targetType/targetId).
// - oldData chỉ giữ các trường nhạy cảm cần đối chiếu (role, status, isBlocked),
//   KHÔNG lưu password hash.
// - Ghi log lỗi không được phép làm hỏng luồng chính, chỉ in log console.
// ============================================================================

// Nạp model AuditLog để ghi bản gi nhật ký.
const AuditLog = require('../models/AuditLog');

// ----------------------------------------------------------------------------
// HÀM: writeAudit({ actorId, action, targetType, targetId, oldData, newData })
// NHẬN VÀO: đối tượng mô tả 1 thao tác quản trị.
// TRẢ VỀ: bản ghi AuditLog đã tạo (hoặc null nếu ghi lỗi).
// ----------------------------------------------------------------------------
async function writeAudit({ actorId, action, targetType, targetId, oldData, newData }) {
  try {
    return await AuditLog.create({
      actorId: actorId || null,
      action,
      targetType: targetType || null,
      targetId: targetId || null,
      oldData: oldData || null,
      newData: newData || null,
    });
  } catch (error) {
    // Ghi log lỗi không chặn nghiệp vụ: thao tác chính vẫn thành công dù log lỗi.
    console.error('Audit log failed:', error?.message || error);
    return null;
  }
}

module.exports = { writeAudit };
