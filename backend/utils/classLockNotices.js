const Class = require('../models/Class');
const { id, fail, noticeInput, appealInput, reviewInput } = require('./appealValidation');

async function readClass(classId) {
  const cls = await Class.findById(id(classId, 'classId')).select('+lockRevision').lean();
  if (!cls) fail(404, 'Class not found');
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
  if (!updated) fail(409, 'The class notice has changed; reload before trying again');
  return updated;
}

async function issueClassLockNotice(classId, actorId, body) {
  const input = noticeInput(body);
  const cls = await readClass(classId);
  if (cls.status !== 'active') fail(409, 'Reopen the class before issuing a new notice');
  if (['pending', 'appealed'].includes(cls.lockNotice?.status)) fail(409, 'This class already has an unresolved lock notice');
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
  if (String(cls.teacher).toLowerCase() !== actorId) fail(403, 'Not authorized to appeal this class notice');
  if (cls.status !== 'active' || cls.lockNotice?.status !== 'pending') fail(409, 'This notice is no longer open for appeal');
  const now = new Date();
  if (!(cls.lockNotice.appealDeadline > now)) fail(409, 'The 24-hour appeal window has closed');
  return updateNotice(cls, { 'lockNotice.status': 'appealed', 'lockNotice.appealMessage': message,
    'lockNotice.appealedAt': now, 'lockNotice.appealedBy': actorId }, null,
  { 'lockNotice.status': 'pending', 'lockNotice.appealDeadline': { $gt: now } });
}

async function reviewClassLockNotice(classId, actorId, body) {
  const { decision, response } = reviewInput(body, ['lock', 'dismiss']);
  const cls = await readClass(classId);
  const current = cls.lockNotice;
  if (!['pending', 'appealed'].includes(current?.status)) fail(409, 'There is no unresolved lock notice');
  const now = new Date();
  if (current.status === 'pending' && !(current.appealDeadline && current.appealDeadline <= now)) {
    fail(409, 'The 24-hour appeal window is still open');
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
  if (cls.status === 'active' && (!current?.status || current.status === 'none')) fail(409, 'Class is already active');
  const now = new Date();
  let history;
  if (current?.status && current.status !== 'none') {
    history = { ...current, reopenedAt: now, reopenedBy: id(actorId), reopenResponse: 'Class reopened by administrator' };
    // Nếu admin hủy thông báo chưa chốt bằng API mở lớp cũ, ghi quyết định hủy.
    // Với thông báo đã khóa, giữ nguyên quyết định, phản hồi và người duyệt trước đó.
    if (['pending', 'appealed'].includes(current.status)) {
      Object.assign(history, { status: 'dismissed', resolvedAt: now, reviewedBy: id(actorId),
        adminResponse: 'Class reopened by administrator' });
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
