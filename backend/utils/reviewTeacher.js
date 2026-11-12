const User = require('../models/User');

// Compare-and-set: chỉ một yêu cầu được chuyển hồ sơ pending sang trạng thái mới.
async function reviewTeacher({ userId, actorId, status, note = '' }) {
  if (!['active', 'rejected'].includes(status)) {
    throw new TypeError('Trạng thái xét duyệt không hợp lệ');
  }
  if (typeof note !== 'string' || note.length > 2000) {
    throw new TypeError('Ghi chú xét duyệt không hợp lệ');
  }
  const now = new Date();
  return User.findOneAndUpdate(
    { _id: userId, role: 'teacher', status: 'pending', deletedAt: null },
    { $set: {
      status,
      updatedAt: now,
      review: { reviewedBy: actorId, reviewedAt: now, note: note.trim() },
    } },
    { new: true, runValidators: true }
  );
}

module.exports = { reviewTeacher };
