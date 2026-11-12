const Class = require('../models/Class');
const { id, fail, noticeInput, appealInput, reviewInput } = require('./appealValidation');

async function readClass(classId) {
  const cls = await Class.findById(id(classId, 'classId')).select('+lockRevision').lean();
  if (!cls) fail(404, 'Không tìm thấy lớp học');
  return cls;
}

// Một document chứa cả quyết định và lịch sử. Compare-and-set theo phiên bản
// bảo vệ cả dữ liệu cũ chưa có lockRevision và các thông báo mới cùng trạng thái.
async function updateNotice(cls, fields, history, conditions = {}) {
  const updated = await Class.findOneAndUpdate(
    { _id: cls._id, status: cls.status, teacher: cls.teacher,
      lockRevision: cls.lockRevision === undefined ? { $exists: false } : cls.lockRevision,
      ...conditions },
    { $set: { ...fields, updatedAt: new Date() }, $inc: { lockRevision: 1 },
      ...(history ? { $push: { lockNoticeHistory: history } } : {}) },
    { new: true, runValidators: true }
  );
  if (!updated) fail(409, 'Thông báo của lớp đã thay đổi; vui lòng tải lại trước khi thử lại');
  return updated;
}

async function issueClassLockNotice(classId, actorId, body) {
  const input = noticeInput(body);
  const cls = await readClass(classId);
  if (cls.status !== 'active') fail(409, 'Vui lòng mở lại lớp trước khi gửi thông báo mới');
  if (['pending', 'appealed'].includes(cls.lockNotice?.status)) fail(409, 'Lớp học đang có thông báo khóa chưa được xử lý');
  const issuedAt = new Date();
  const notice = { ...input, status: 'pending', issuedAt, issuedBy: id(actorId),
    appealDeadline: new Date(issuedAt.getTime() + 86400000), appealMessage: '', appealedAt: null,
    resolvedAt: null, adminResponse: '' };
  const history = cls.lockNotice?.status && cls.lockNotice.status !== 'none' ? cls.lockNotice : null;
  return updateNotice(cls, { lockNotice: notice }, history);
}

async function appealClassLockNotice(classId, actorId, body) {
  const message = appealInput(body);
  const cls = await readClass(classId);
  actorId = id(actorId);
  if (String(cls.teacher).toLowerCase() !== actorId) fail(403, 'Bạn không có quyền kháng cáo thông báo của lớp này');
  if (cls.status !== 'active' || cls.lockNotice?.status !== 'pending') fail(409, 'Thông báo này không còn tiếp nhận kháng cáo');
  const now = new Date();
  if (!(cls.lockNotice.appealDeadline > now)) fail(409, 'Đã hết thời hạn kháng cáo 24 giờ');
  return updateNotice(cls, { 'lockNotice.status': 'appealed', 'lockNotice.appealMessage': message,
    'lockNotice.appealedAt': now, 'lockNotice.appealedBy': actorId }, null,
  { 'lockNotice.status': 'pending', 'lockNotice.appealDeadline': { $gt: now } });
}

async function reviewClassLockNotice(classId, actorId, body) {
  const { decision, response } = reviewInput(body, ['lock', 'dismiss']);
  const cls = await readClass(classId);
  const current = cls.lockNotice;
  if (!['pending', 'appealed'].includes(current?.status)) fail(409, 'Không có thông báo khóa đang chờ xử lý');
  const now = new Date();
  if (current.status === 'pending' && !(current.appealDeadline && current.appealDeadline <= now)) {
    fail(409, 'Vẫn còn trong thời hạn kháng cáo 24 giờ');
  }
  const resolved = { ...current, status: decision === 'lock' ? 'locked' : 'dismissed',
    resolvedAt: now, reviewedBy: id(actorId), adminResponse: response };
  const clsUpdated = await updateNotice(cls, {
    status: decision === 'lock' ? 'inactive' : 'active',
    lockNotice: decision === 'lock' ? resolved : { status: 'none' },
  }, decision === 'dismiss' ? resolved : null);
  return { decision, class: clsUpdated };
}

async function reopenClass(classId, actorId) {
  const cls = await readClass(classId);
  const current = cls.lockNotice;
  if (cls.status === 'active' && (!current?.status || current.status === 'none')) fail(409, 'Lớp học đang hoạt động');
  const now = new Date();
  let history;
  if (current?.status && current.status !== 'none') {
    history = { ...current, reopenedAt: now, reopenedBy: id(actorId), reopenResponse: 'Quản trị viên đã mở lại lớp học' };
    // Nếu admin hủy thông báo chưa chốt bằng API mở lớp cũ, ghi quyết định hủy.
    // Với thông báo đã khóa, giữ nguyên quyết định, phản hồi và người duyệt trước đó.
    if (['pending', 'appealed'].includes(current.status)) {
      Object.assign(history, { status: 'dismissed', resolvedAt: now, reviewedBy: id(actorId),
        adminResponse: 'Quản trị viên đã mở lại lớp học' });
    }
  }
  return updateNotice(cls, { status: 'active', lockNotice: { status: 'none' } }, history);
}

// Học sinh trong lớp chỉ cần trạng thái thông báo, không nhận hồ sơ kháng cáo
// của giáo viên qua chi tiết lớp hoặc danh sách phân trang.
function classAppealsForViewer(cls, role) {
  if (role !== 'student') return cls;
  const result = typeof cls.toObject === 'function' ? cls.toObject() : { ...cls };
  if (result.lockNotice) result.lockNotice = { status: result.lockNotice.status || 'none' };
  delete result.lockNoticeHistory;
  delete result.lockRevision;
  return result;
}

module.exports = { issueClassLockNotice, appealClassLockNotice, reviewClassLockNotice, reopenClass, classAppealsForViewer };
