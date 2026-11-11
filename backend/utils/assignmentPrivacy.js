const Class = require('../models/Class');
const { objectId, fail } = require('./sessionValidation');

async function assignmentClassAccess(classId, req) {
  const id = String(classId || '');
  objectId(id, 'classId');
  const cls = await Class.findById(id).select('teacher students status');
  // Không cho phép đi tiếp khi quan hệ lớp bị thiếu, kể cả admin.
  if (!cls) fail(404, 'Không tìm thấy lớp học');
  if (req.userRole === 'admin') return;
  if (req.userRole === 'teacher') {
    if (String(cls.teacher).toLowerCase() !== req.userId.toLowerCase()) fail(403, 'Bạn không có quyền truy cập bài tập của lớp này');
  } else if (req.userRole === 'student') {
    if (!cls.students?.some((student) => String(student._id || student).toLowerCase() === req.userId.toLowerCase())) {
      fail(403, 'Vui lòng tham gia lớp trước khi xem bài tập');
    }
  } else fail(403, 'Bạn không có quyền truy cập bài tập');
  if (cls.status === 'inactive') fail(423, 'Lớp học này đã bị khóa');
}

// Chỉ lọc bản sao DTO, không cắt mảng bài nộp trên document sẽ được lưu.
// Hàm phải được gọi sau khi kiểm tra quyền lớp; giáo viên/admin mới được giữ toàn bộ.
function assignmentForViewer(assignment, req) {
  const data = typeof assignment.toObject === 'function' ? assignment.toObject() : { ...assignment };
  if (Array.isArray(data.submissions) && req.userRole !== 'teacher' && req.userRole !== 'admin') {
    data.submissions = req.userRole === 'student' ? data.submissions.filter((submission) =>
      String(submission.student?._id || submission.student).toLowerCase() === req.userId.toLowerCase()) : [];
  }
  return data;
}

module.exports = { assignmentClassAccess, assignmentForViewer };
