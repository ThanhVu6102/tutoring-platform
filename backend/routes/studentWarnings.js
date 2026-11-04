const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const User = require('../models/User');
const { appealStudentWarning, reviewStudentWarning, finalizeExpiredStudentWarnings } = require('../utils/studentWarnings');
const { id, noticeInput, handleAppeal } = require('../utils/appealValidation');

const router = express.Router();
// Học sinh xem cảnh báo của mình nhưng không nhận email riêng của người phát hành.
router.use(require('../middleware/userPrivacy'));

// Validation hoàn tất trước mọi thao tác dữ liệu, kể cả trường hợp ID/body bị giả mạo.
router.post('/:studentId', authMiddleware, adminOnly, handleAppeal(async (req, res) => {
  const input = noticeInput(req.body);
  const classId = id(req.body.classId, 'classId');
  const studentId = id(req.params.studentId, 'studentId');
  const [student, classData] = await Promise.all([
    User.findById(studentId).select('role'),
    Class.findById(classId).select('name students status'),
  ]);
  if (!student || student.role !== 'student') return res.status(404).json({ message: 'Student not found' });
  if (!classData) return res.status(404).json({ message: 'Class not found' });
  if (classData.status !== 'active') {
    return res.status(423).json({ message: 'Warnings can only be sent for active classes' });
  }
  if (!classData.students.some((member) => member.toString() === student._id.toString())) {
    return res.status(409).json({ message: 'Student is not currently in this class' });
  }
  const issuedAt = new Date();
  const warning = await StudentWarning.create({
    ...input, student: student._id, class: classData._id, issuedBy: req.userId, issuedAt,
    appealDeadline: new Date(issuedAt.getTime() + 7 * 86400000),
  });
  res.status(201).json({ message: 'Warning sent to student', warning });
}));

router.get('/mine', authMiddleware, handleAppeal(async (req, res) => {
  if (req.userRole !== 'student') {
    return res.status(403).json({ message: 'Only students can view student warnings' });
  }
  await finalizeExpiredStudentWarnings(req.userId);
  const warnings = await StudentWarning.find({ student: req.userId })
    .populate('class', 'name subject')
    .populate('issuedBy', 'name email')
    .sort({ issuedAt: -1 });
  res.json(warnings);
}));

router.post('/:warningId/appeal', authMiddleware, handleAppeal(async (req, res) => {
  if (req.userRole !== 'student') {
    return res.status(403).json({ message: 'Only students can appeal a warning' });
  }
  const warning = await appealStudentWarning(req.params.warningId, req.userId, req.body);
  res.json({ message: 'Appeal sent to the administrator', warning });
}));

router.get('/', authMiddleware, adminOnly, handleAppeal(async (req, res) => {
  await finalizeExpiredStudentWarnings();
  const filter = {};
  if (['pending', 'appealed', 'confirmed', 'dismissed'].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const warnings = await StudentWarning.find(filter)
    .populate('student', 'name email disciplinarySanctions classRemovalIncidents suspendedUntil permanentlyBanned')
    .populate('class', 'name subject')
    .populate('issuedBy', 'name email')
    .sort({ issuedAt: -1 });
  res.json(warnings);
}));

router.patch('/:warningId/review', authMiddleware, adminOnly, handleAppeal(async (req, res) => {
  const { decision, warning } = await reviewStudentWarning(req.params.warningId, req.userId, req.body);
  await warning.populate([
    { path: 'student', select: 'name email disciplinarySanctions classRemovalIncidents suspendedUntil permanentlyBanned' },
    { path: 'class', select: 'name subject' },
  ]);
  res.json({ message: decision === 'confirm' ? 'Warning confirmed' : 'Warning dismissed', warning });
}));

module.exports = router;
