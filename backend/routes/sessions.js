const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const ClassSession = require('../models/ClassSession');
const service = require('../utils/classSessions');
const { pagination } = require('../utils/sessionValidation');
const { sendError } = require('../utils/respond');
const { writeAudit } = require('../utils/audit');

const classRouter = express.Router();
const sessionRouter = express.Router();
const actor = (req) => ({ id: req.userId, role: req.userRole });
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if ([400, 403, 404, 409, 423, 503].includes(error.statusCode)) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return sendError(res, error);
  }
};

function publicSession(item) {
  const data = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  delete data.attendances;
  return data;
}

classRouter.post('/:id/sessions', authMiddleware, teacherOnly, handle(async (req, res) => {
  const item = await service.createSession(req.params.id, actor(req), req.body);
  await writeAudit({ actorId: req.userId, action: 'create_session', targetType: 'session', targetId: item._id,
    newData: { classId: req.params.id, startsAt: item.startsAt, endsAt: item.endsAt } });
  res.status(201).json({ message: 'Đã tạo buổi học', session: publicSession(item) });
}));

classRouter.get('/:id/sessions', authMiddleware, handle(async (req, res) => {
  const { page, limit } = pagination(req.query);
  await service.accessibleClass(req.params.id, actor(req));
  const filter = { class: req.params.id };
  const [items, total] = await Promise.all([
    ClassSession.find(filter).select('-attendances').sort({ startsAt: 1, _id: 1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    ClassSession.countDocuments(filter),
  ]);
  res.json({ items, page, limit, total });
}));

sessionRouter.get('/:id', authMiddleware, handle(async (req, res) => {
  const { item } = await service.accessibleSession(req.params.id, actor(req));
  res.json(publicSession(item));
}));

sessionRouter.put('/:id/status', authMiddleware, teacherOnly, handle(async (req, res) => {
  const item = await service.changeStatus(req.params.id, actor(req), req.body.status);
  await writeAudit({ actorId: req.userId, action: 'change_session_status', targetType: 'session', targetId: item._id,
    newData: { status: item.status } });
  res.json({ message: 'Đã cập nhật trạng thái buổi học', session: publicSession(item) });
}));

sessionRouter.get('/:id/attendances', authMiddleware, handle(async (req, res) => {
  const { item, manager } = await service.accessibleSession(req.params.id, actor(req));
  // Học sinh chỉ xem điểm danh của chính mình, không thấy ghi chú của bạn học.
  const rows = manager ? item.attendances : item.attendances
    .filter((row) => String(row.student) === req.userId)
    .map((row) => ({ student: row.student, status: row.status, checkedInAt: row.checkedInAt, updatedAt: row.updatedAt }));
  res.json({ items: rows });
}));

sessionRouter.post('/:id/check-in', authMiddleware, teacherOnly, handle(async (req, res) => {
  const attendance = await service.checkIn(req.params.id, actor(req), req.body);
  res.json({ message: 'Đã cập nhật điểm danh', attendance });
}));

module.exports = { classRouter, sessionRouter };
