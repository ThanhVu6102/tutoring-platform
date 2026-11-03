// Danh sách cho phép giúp trường mới trong schema không tự động bị lộ qua API.
const PUBLIC_USER_FIELDS = ['_id', 'id', 'name', 'role', 'avatar', 'bio'];
const PRIVATE_USER_FIELDS = [
  ...PUBLIC_USER_FIELDS, 'email', 'phone', 'policiesAcceptedAt', 'policyVersion',
  'disciplinarySanctions', 'classRemovalIncidents', 'suspendedUntil', 'permanentlyBanned',
  'status', 'isBlocked', 'review', 'deletedAt', 'enrolledClasses', 'createdAt', 'updatedAt', '__v',
];
// Chỉ nạp trường đã được cho phép khi populate; bộ lọc response vẫn kiểm tra người xem.
const USER_POPULATE_FIELDS = PRIVATE_USER_FIELDS.filter((field) => field !== 'id').join(' ');
const USER_REFERENCE_KEYS = new Set([
  'user', 'teacher', 'student', 'students', 'issuedBy', 'reviewedBy', 'actorId',
]);

function plainObject(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function userForViewer(value, req) {
  const user = plainObject(value);
  if (!user || typeof user !== 'object' || typeof user.toHexString === 'function') return user;
  const id = user._id || user.id;
  // Chỉ chính chủ hoặc admin được nhận các trường riêng tư hiện có; luôn loại
  // password và scheduleRevision, kể cả khi query vô tình chọn chúng.
  const privileged = req.userRole === 'admin' ||
    (id != null && req.userId != null && String(id) === String(req.userId));
  const fields = privileged ? PRIVATE_USER_FIELDS : PUBLIC_USER_FIELDS;
  const result = {};
  for (const field of fields) {
    if (Object.hasOwn(user, field)) result[field] = user[field];
  }
  // Hồ sơ có thể chứa người duyệt được populate: tiếp tục kiểm tra quyền người xem.
  return filterUserReferences(result, req);
}

function filterUserReferences(value, req, isUser = false) {
  if (Array.isArray(value)) return value.map((item) => filterUserReferences(item, req, isUser));
  if (!value || typeof value !== 'object' || value instanceof Date ||
      typeof value.toHexString === 'function') return value;
  if (isUser) return userForViewer(value, req);
  const result = {};
  for (const [key, item] of Object.entries(plainObject(value))) {
    result[key] = filterUserReferences(item, req, USER_REFERENCE_KEYS.has(key));
  }
  return result;
}

module.exports = { USER_POPULATE_FIELDS, userForViewer, filterUserReferences };
