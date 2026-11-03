// Danh sách cho phép giúp trường mới trong schema không tự động bị lộ qua API.
const PUBLIC_USER_FIELDS = Object.freeze(['_id', 'id', 'name', 'role', 'avatar', 'bio']);
const PRIVATE_USER_FIELDS = Object.freeze([
  ...PUBLIC_USER_FIELDS, 'email', 'phone', 'policiesAcceptedAt', 'policyVersion',
  'disciplinarySanctions', 'classRemovalIncidents', 'suspendedUntil', 'permanentlyBanned',
  'status', 'isBlocked', 'review', 'deletedAt', 'enrolledClasses', 'createdAt', 'updatedAt', '__v',
]);
const REVIEW_FIELDS = Object.freeze(['reviewedBy', 'reviewedAt', 'note']);
// Chỉ nạp trường đã được cho phép khi populate; bộ lọc response vẫn kiểm tra người xem.
const USER_POPULATE_FIELDS = PRIVATE_USER_FIELDS.filter((field) => field !== 'id').join(' ');
const PUBLIC_USER_QUERY_FIELDS = PUBLIC_USER_FIELDS.filter((field) => field !== 'id').join(' ');
const USER_REFERENCE_KEYS = new Set([
  'user', 'teacher', 'student', 'students', 'issuedBy', 'reviewedBy', 'actorId',
]);

function plainObject(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function canReadPrivateUser(req, id) {
  // ObjectId viết hoa/thường vẫn là cùng một tài khoản trong MongoDB.
  return req.userRole === 'admin' ||
    (id != null && req.userId != null && String(id).toLowerCase() === String(req.userId).toLowerCase());
}

// Hồ sơ theo ID đã biết được giới hạn ngay ở query, không nạp email/phone/review
// của người khác rồi mới bỏ đi. Không dùng role/query parameter do client tự gửi.
function userQueryFields(req, id) {
  return canReadPrivateUser(req, id) ? USER_POPULATE_FIELDS : PUBLIC_USER_QUERY_FIELDS;
}

function userForViewer(value, req) {
  const user = plainObject(value);
  if (!user || typeof user !== 'object' || typeof user.toHexString === 'function') return user;
  const id = user._id || user.id;
  // Chỉ chính chủ hoặc admin được nhận các trường riêng tư hiện có; luôn loại
  // password và scheduleRevision, kể cả khi query vô tình chọn chúng.
  const privileged = canReadPrivateUser(req, id);
  const fields = privileged ? PRIVATE_USER_FIELDS : PUBLIC_USER_FIELDS;
  const result = {};
  for (const field of fields) {
    if (Object.hasOwn(user, field)) result[field] = user[field];
  }
  // Allowlist phải áp dụng cả bên trong review: trường bổ sung về sau không được
  // tự trả ra, kể cả với chính chủ/admin. Giữ ba trường xét duyệt đã được cho phép.
  if (result.review != null) {
    const review = plainObject(result.review);
    result.review = {};
    for (const field of REVIEW_FIELDS) {
      if (typeof review === 'object' && Object.hasOwn(review, field)) {
        result.review[field] = review[field];
      }
    }
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

module.exports = { USER_POPULATE_FIELDS, userQueryFields, userForViewer, filterUserReferences };
