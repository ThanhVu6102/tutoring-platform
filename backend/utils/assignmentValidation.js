const { fail, objectId } = require('./sessionValidation');

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Dữ liệu không hợp lệ');
  return body;
}

// Chỉ lưu đường dẫn web; không tải file hoặc gọi URL do người dùng gửi từ server.
function assignmentSubmissionInput(body) {
  const { fileUrl } = bodyObject(body);
  if (typeof fileUrl !== 'string' || !fileUrl.trim()) fail(400, 'Vui lòng nhập đường dẫn bài nộp');
  let url;
  try { url = new URL(fileUrl.trim()); } catch { fail(400, 'Đường dẫn bài nộp không hợp lệ'); }
  if (!['http:', 'https:'].includes(url.protocol)) fail(400, 'Đường dẫn bài nộp phải dùng HTTP hoặc HTTPS');
  return fileUrl.trim();
}

// Điểm 0 là hợp lệ; không ép chuỗi/rỗng/boolean thành điểm số.
function assignmentGradeInput(body, totalPoints) {
  const { studentId, score, feedback } = bodyObject(body);
  objectId(studentId, 'studentId');
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0
    || !Number.isFinite(totalPoints) || totalPoints < 0 || score > totalPoints) {
    fail(400, 'Điểm phải là số từ 0 đến tổng điểm của bài tập');
  }
  if (feedback !== undefined && typeof feedback !== 'string') fail(400, 'Nhận xét phải là chuỗi văn bản');
  return { studentId: studentId.toLowerCase(), score, feedback };
}

module.exports = { assignmentSubmissionInput, assignmentGradeInput };
