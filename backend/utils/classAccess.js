// ============================================================================
// FILE: backend/utils/classAccess.js
// MỤC ĐÍCH: Kiểm tra quyền truy cập lớp học ở backend.
// - Admin: truy cập mọi lớp.
// - Giáo viên: chỉ lớp mình phụ trách.
// - Học sinh: chỉ lớp mình đã tham gia (mảng Class.students).
// - Không tin role/classId do client gửi; luôn đối chiếu với DB.
// ============================================================================

const mongoose = require('mongoose');
const Class = require('../models/Class');

// ----------------------------------------------------------------------------
// HÀM: checkClassAccess(classId, userId, role)
// TRẢ VỀ: { ok, status, message, cls, isTeacher, isStudent, isManager }
// - Dùng 1 truy vấn nhẹ, chỉ lấy teacher + students và dùng .lean().
// ----------------------------------------------------------------------------
async function checkClassAccess(classId, userId, role) {
  // Chặn classId rỗng/sai định dạng trước khi truy vấn.
  if (!classId || !mongoose.isValidObjectId(classId)) {
    return { ok: false, status: 400, message: 'classId không hợp lệ' };
  }

  // Chỉ lấy 2 cột cần thiết để kiểm tra quyền -> nhanh và nhẹ.
  const cls = await Class.findById(classId).select('teacher students').lean();
  if (!cls) {
    return { ok: false, status: 404, message: 'Không tìm thấy lớp học' };
  }

  // Admin có toàn quyền.
  if (role === 'admin') {
    return { ok: true, cls, isTeacher: false, isStudent: false, isManager: true };
  }

  const uid = String(userId);
  const isTeacher = String(cls.teacher) === uid;
  const isStudent = (cls.students || []).some((id) => String(id) === uid);

  if (!isTeacher && !isStudent) {
    return {
      ok: false,
      status: 403,
      message: 'Bạn không có quyền truy cập lớp này',
      cls,
    };
  }

  return { ok: true, cls, isTeacher, isStudent, isManager: isTeacher };
}

// ----------------------------------------------------------------------------
// HÀM: isOwnerOrAdmin(teacherId, req)
// Dùng cho tài nguyên có trường teacher (video, tài liệu, quiz, bài tập...).
// ----------------------------------------------------------------------------
function isOwnerOrAdmin(teacherId, req) {
  return req.userRole === 'admin' || String(teacherId) === String(req.userId);
}

module.exports = { checkClassAccess, isOwnerOrAdmin };
