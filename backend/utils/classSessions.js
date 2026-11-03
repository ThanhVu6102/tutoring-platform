const Class = require('../models/Class');
const User = require('../models/User');
const ClassSession = require('../models/ClassSession');
const { transaction } = require('./transaction');
const { fail, objectId, text, sessionInput } = require('./sessionValidation');
const { activeAccountFilter } = require('./accountAccess');

function canManage(cls, actor) {
  return actor.role === 'admin' || (actor.role === 'teacher' && String(cls.teacher) === actor.id);
}

async function accessibleClass(classId, actor, managerOnly = false) {
  objectId(classId, 'classId');
  const cls = await Class.findById(classId).lean();
  if (!cls) fail(404, 'Không tìm thấy lớp học');
  const manager = canManage(cls, actor);
  const student = actor.role === 'student' && cls.students.some((id) => String(id) === actor.id);
  if (!manager && (managerOnly || !student)) fail(403, 'Bạn không có quyền truy cập lớp này');
  // Không cho API mới đi vòng qua chính sách khóa lớp của main.
  if (cls.status === 'inactive' && (student || managerOnly)) fail(423, 'Lớp đã bị khóa hoặc lưu trữ');
  return { cls, manager };
}

async function accessibleSession(id, actor, managerOnly = false) {
  objectId(id, 'sessionId');
  const item = await ClassSession.findById(id).lean();
  if (!item) fail(404, 'Không tìm thấy buổi học');
  const access = await accessibleClass(String(item.class), actor, managerOnly);
  return { item, ...access };
}

async function createSession(classId, actor, body) {
  objectId(classId, 'classId');
  const input = sessionInput(body);
  return transaction(async (session) => {
    const cls = await Class.findById(classId).session(session).lean();
    if (!cls) fail(404, 'Không tìm thấy lớp học');
    if (!canManage(cls, actor)) fail(403, 'Bạn không có quyền tạo buổi học cho lớp này');
    if (cls.status !== 'active') fail(409, 'Lớp đã đóng, không thể tạo buổi học');

    // Cùng gia sư phải ghi cùng document trước khi kiểm tra lịch. Transaction
    // cạnh tranh gặp WriteConflict sẽ được withTransaction thử lại từ snapshot mới.
    const tutor = await User.findOneAndUpdate(
      { _id: cls.teacher, role: { $in: ['teacher', 'admin'] }, ...activeAccountFilter() },
      { $inc: { scheduleRevision: 1 } }, { session, new: true }
    );
    if (!tutor) fail(409, 'Giáo viên phụ trách không hoạt động');
    const lockedClass = await Class.findOneAndUpdate(
      { _id: cls._id, teacher: cls.teacher, status: 'active' },
      { $inc: { sessionRevision: 1 } }, { session, new: true }
    );
    if (!lockedClass) fail(409, 'Lớp học đã thay đổi, vui lòng thử lại');

    const overlap = await ClassSession.exists({
      teacher: cls.teacher, status: { $ne: 'cancelled' },
      startsAt: { $lt: input.endsAt }, endsAt: { $gt: input.startsAt },
    }).session(session);
    if (overlap) fail(409, 'Gia sư có buổi học trùng giờ');

    const students = [...new Set(lockedClass.students.map(String))];
    const [created] = await ClassSession.create([{
      ...input, class: cls._id, teacher: cls.teacher, createdBy: actor.id,
      attendances: students.map((student) => ({ student, status: 'absent' })),
    }], { session });
    return created;
  });
}

const transitions = {
  scheduled: ['ongoing', 'completed', 'cancelled'],
  ongoing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

async function changeStatus(id, actor, status) {
  if (typeof status !== 'string' || !Object.hasOwn(transitions, status)) fail(400, 'Trạng thái buổi học không hợp lệ');
  const { item } = await accessibleSession(id, actor, true);
  if (!transitions[item.status].includes(status)) fail(409, 'Không thể chuyển trạng thái buổi học');
  const updated = await ClassSession.findOneAndUpdate(
    { _id: id, status: item.status },
    { $set: { status, statusChangedBy: actor.id } }, { new: true, runValidators: true }
  );
  if (!updated) fail(409, 'Buổi học đã thay đổi, vui lòng tải lại');
  return updated;
}

async function checkIn(id, actor, body) {
  const studentId = objectId(body.student_id, 'student_id');
  if (!['present', 'absent', 'late', 'excused'].includes(body.status)) fail(400, 'Trạng thái điểm danh không hợp lệ');
  const note = text(body.note, 2000, 'Ghi chú');
  const { item, cls } = await accessibleSession(id, actor, true);
  if (!cls.students.some((student) => String(student) === studentId)) fail(403, 'Học sinh không thuộc lớp này');
  if (!item.attendances.some((row) => String(row.student) === studentId)) {
    fail(409, 'Học sinh không có trong danh sách của buổi học này');
  }
  const now = new Date();
  const updated = await ClassSession.findOneAndUpdate(
    { _id: id, status: { $in: ['ongoing', 'completed'] }, 'attendances.student': studentId },
    { $set: {
      'attendances.$.status': body.status,
      'attendances.$.note': note,
      'attendances.$.checkedInAt': ['present', 'late'].includes(body.status) ? now : null,
      'attendances.$.recordedBy': actor.id,
      'attendances.$.updatedAt': now,
    } }, { new: true, runValidators: true }
  );
  if (!updated) fail(409, 'Chỉ điểm danh buổi đang diễn ra hoặc đã hoàn thành');
  return updated.attendances.find((row) => String(row.student) === studentId);
}

module.exports = { canManage, accessibleClass, accessibleSession, createSession, changeStatus, checkIn };
