const User = require('../models/User');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const { readPage, pagination } = require('./pagination');
const { userForViewer } = require('./userPrivacy');
const { fail } = require('./sessionValidation');

const statuses = ['pending', 'appealed', 'confirmed', 'dismissed'];
// Giữ đúng bộ lọc của UI cũ: không tự đưa lớp chỉ có lịch sử vào nhóm đang hiển thị.
const classFilter = () => ({ $or: [{ status: 'inactive' },
  { 'lockNotice.status': { $exists: true, $nin: ['none', null, ''] } }] });

async function moderationSummary() {
  const [totalWarnings, openWarnings, violationClasses] = await Promise.all([
    StudentWarning.countDocuments({}),
    StudentWarning.countDocuments({ status: { $in: ['pending', 'appealed'] } }),
    Class.countDocuments(classFilter()),
  ]);
  return { totalWarnings, openWarnings, violationClasses };
}

function warningFilter(query) {
  if (query.status === undefined) return {};
  if (!statuses.includes(query.status)) fail(400, 'Trạng thái cảnh báo không hợp lệ');
  return { status: query.status };
}

function moderationWarnings(req) {
  return readPage(StudentWarning, req, warningFilter(req.query), {
    sort: { issuedAt: -1, _id: -1 },
    select: 'student class issuedBy reasonCode policyLevel details status issuedAt appealDeadline appealMessage appealedAt appealedBy resolvedAt reviewedBy adminResponse violationCounted classWarningCount classRemovalApplied accountSanction',
    populate: [
      { path: 'student', select: 'name email disciplinarySanctions classRemovalIncidents suspendedUntil permanentlyBanned' },
      { path: 'class', select: 'name subject' },
      { path: 'issuedBy', select: 'name email' },
    ],
  });
}

function moderationClasses(req) {
  return readPage(Class, req, classFilter(), {
    select: 'name subject teacher status lockNotice createdAt updatedAt',
    populate: { path: 'teacher', select: 'name' },
  });
}

async function moderationStudents(req) {
  const { page, limit } = pagination(req.query);
  const now = new Date();
  // Lookup chỉ lấy bằng chứng tồn tại, không gom mọi warning ID vào RAM/response.
  // Facet dùng chung bộ lọc cho trang và count; không cắt trang trước khi lọc nhóm ảnh hưởng.
  const [result] = await User.aggregate([
    { $match: { role: 'student', deletedAt: null } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $project: { name: 1, email: 1, role: 1, status: 1, isBlocked: 1, disciplinarySanctions: 1,
      classRemovalIncidents: 1, suspendedUntil: 1, permanentlyBanned: 1, createdAt: 1, updatedAt: 1 } },
    { $lookup: { from: StudentWarning.collection.name, localField: '_id', foreignField: 'student',
      pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }], as: 'warningMatch' } },
    { $match: { $or: [
      { 'warningMatch.0': { $exists: true } }, { classRemovalIncidents: { $gt: 0 } },
      { disciplinarySanctions: { $gt: 0 } }, { permanentlyBanned: true }, { suspendedUntil: { $gt: now } },
    ] } },
    { $facet: { data: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { warningMatch: 0 } }],
      total: [{ $count: 'count' }] } },
  ]);
  const total = result?.total[0]?.count || 0;
  return { data: (result?.data || []).map((user) => userForViewer(user, req)),
    page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { moderationSummary, moderationWarnings, moderationStudents, moderationClasses, warningFilter };
