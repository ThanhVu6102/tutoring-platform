const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const User = require('../models/User');
const { transaction } = require('./transaction');
const { id, fail, appealInput, reviewInput } = require('./appealValidation');

async function warningConflict(warningId, studentId) {
  const filter = { _id: warningId, ...(studentId ? { student: studentId } : {}) };
  if (!await StudentWarning.exists(filter)) fail(404, 'Warning not found');
  fail(409, 'This warning has already changed or is no longer open for this action');
}

// Hạn gửi và quyền sở hữu nằm ngay trong điều kiện ghi, không dựa vào bản đọc trước đó.
async function appealStudentWarning(warningId, studentId, body) {
  warningId = id(warningId, 'warningId');
  studentId = id(studentId, 'studentId');
  const message = appealInput(body);
  const now = new Date();
  const warning = await StudentWarning.findOneAndUpdate(
    { _id: warningId, student: studentId, status: 'pending', violationCounted: { $ne: true },
      appealDeadline: { $gt: now } },
    { $set: { status: 'appealed', appealMessage: message, appealedAt: now, appealedBy: studentId } },
    { new: true, runValidators: true }
  );
  if (!warning) await warningConflict(warningId, studentId);
  return warning;
}

// Cảnh báo, roster và chế tài phải cùng commit/rollback. Khóa ghi trên học sinh
// tránh hai cảnh báo khác nhau cùng đọc số đếm cũ rồi bỏ sót/cộng lặp chế tài.
const confirmStudentWarning = async (warningId, adminResponse, { reviewedBy, expiredBefore } = {}) => {
  warningId = id(String(warningId), 'warningId');
  if (!expiredBefore) reviewedBy = id(reviewedBy, 'reviewedBy');
  const result = await transaction(async (session) => {
    const filter = { _id: warningId, status: expiredBefore ? 'pending' : 'appealed',
      violationCounted: { $ne: true }, ...(expiredBefore ? { appealDeadline: { $lte: expiredBefore } } : {}) };
    const candidate = await StudentWarning.findOne(filter).session(session);
    if (!candidate) return null;
    const student = await User.findOneAndUpdate(
      { _id: candidate.student }, { $inc: { warningRevision: 1 } }, { session, new: true }
    );
    if (!student) fail(409, 'The student for this warning no longer exists');

    const now = new Date();
    const warning = await StudentWarning.findOneAndUpdate(filter, { $set: {
      status: 'confirmed', violationCounted: true, resolvedAt: now,
      adminResponse, reviewedBy: reviewedBy || null,
    } }, { session, new: true, runValidators: true });
    if (!warning) return null;
    warning.classWarningCount = await StudentWarning.countDocuments({
      student: warning.student, class: warning.class, violationCounted: true,
    }).session(session);

    if (warning.classWarningCount >= 3) {
      const previousRemoval = await StudentWarning.exists({
        student: warning.student, class: warning.class, classRemovalApplied: true,
      }).session(session);
      // Chỉ một lần gỡ thực sự khỏi roster mới tạo sự việc; không cộng khi đã rời lớp.
      const removed = await Class.findOneAndUpdate(
        { _id: warning.class, students: warning.student },
        { $pull: { students: warning.student } }, { session, new: true }
      );
      if (removed) {
        const update = { $pull: { enrolledClasses: warning.class } };
        if (!previousRemoval) {
          update.$inc = { classRemovalIncidents: 1 };
          if ((student.classRemovalIncidents || 0) + 1 >= 2) {
            const sanctions = (student.disciplinarySanctions || 0) + 1;
            update.$inc.disciplinarySanctions = 1;
            if (sanctions <= 2) {
              update.$set = { suspendedUntil: new Date(now.getTime() + (sanctions === 1 ? 7 : 30) * 86400000) };
              warning.accountSanction = sanctions === 1 ? 'suspension_7_days' : 'suspension_1_month';
            } else {
              update.$set = { permanentlyBanned: true, suspendedUntil: null };
              warning.accountSanction = 'permanent_ban';
            }
          }
        }
        await User.updateOne({ _id: student._id }, update, { session, runValidators: true });
        warning.classRemovalApplied = true;
      }
    }
    await warning.save({ session });
    return warning;
  });
  // Populate response sau commit không được dùng session đã đóng.
  if (result) result.$session(null);
  return result;
};

async function reviewStudentWarning(warningId, actorId, body) {
  warningId = id(warningId, 'warningId');
  actorId = id(actorId, 'reviewedBy');
  const { decision, response } = reviewInput(body, ['confirm', 'dismiss']);
  const warning = decision === 'confirm'
    ? await confirmStudentWarning(warningId, response || 'Kháng cáo bị từ chối; cảnh báo được xác nhận.', { reviewedBy: actorId })
    : await StudentWarning.findOneAndUpdate(
      { _id: warningId, status: 'appealed', violationCounted: { $ne: true } },
      { $set: { status: 'dismissed', violationCounted: false, resolvedAt: new Date(), reviewedBy: actorId,
        adminResponse: response || 'Kháng cáo được chấp thuận; cảnh báo đã được gỡ.' } },
      { new: true, runValidators: true }
    );
  if (!warning) await warningConflict(warningId);
  return { decision, warning };
}

const finalizeExpiredStudentWarnings = async (studentId) => {
  const now = new Date();
  const filter = {
    status: 'pending',
    violationCounted: { $ne: true },
    appealDeadline: { $lte: now },
  };
  if (studentId) filter.student = studentId;
  const expiredWarnings = await StudentWarning.find(filter).select('_id');
  for (const warning of expiredWarnings) {
    // Kiểm tra lại pending + deadline trong transaction: danh sách cũ không được
    // tự xác nhận một kháng cáo vừa được nhận hoặc một quyết định đã xử lý.
    await confirmStudentWarning(warning._id, 'Kháng cáo không được gửi trong thời hạn 7 ngày.', { expiredBefore: now });
  }
};

module.exports = { appealStudentWarning, reviewStudentWarning, confirmStudentWarning, finalizeExpiredStudentWarnings };
