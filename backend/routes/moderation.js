const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { finalizeExpiredStudentWarnings } = require('../utils/studentWarnings');
const { pagination } = require('../utils/pagination');
const { handleAppeal } = require('../utils/appealValidation');
const service = require('../utils/moderation');

const router = express.Router();
// Role lấy từ DB trước mọi lookup/count; lọc cả DTO user lồng và user gốc.
router.use(authMiddleware, adminOnly, require('../middleware/userPrivacy'));
router.get('/summary', handleAppeal(async (req, res) => {
  await finalizeExpiredStudentWarnings();
  res.json(await service.moderationSummary());
}));

for (const [section, handler] of [
  ['warnings', service.moderationWarnings], ['students', service.moderationStudents], ['classes', service.moderationClasses],
]) {
  router.get(`/${section}`, handleAppeal(async (req, res) => {
    // Từ chối tham số sai trước bước xử lý hết hạn có thể ghi dữ liệu.
    pagination(req.query);
    if (section === 'warnings') service.warningFilter(req.query);
    // Giữ nghiệp vụ BE #03; chưa chuyển sang job hoặc chấp nhận số đếm chưa chốt.
    await finalizeExpiredStudentWarnings();
    res.json(await handler(req));
  }));
}

module.exports = router;
