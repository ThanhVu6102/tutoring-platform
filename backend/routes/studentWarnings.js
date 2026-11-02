const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const User = require('../models/User');
const { confirmStudentWarning, finalizeExpiredStudentWarnings } = require('../utils/studentWarnings');

const router = express.Router();
const validReasons = [
  'spam', 'abusive_content', 'copyright', 'account_sharing', 'academic_fraud',
  'illegal_content', 'privacy_breach', 'financial_misconduct', 'class_disruption', 'other',
];

router.post('/:studentId', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { classId, reasonCode, policyLevel, details } = req.body;
    if (!classId || !validReasons.includes(reasonCode)) {
      return res.status(400).json({ message: 'Select a class and valid policy reason' });
    }
    if (![1, 2, 3].includes(Number(policyLevel))) {
      return res.status(400).json({ message: 'Select a policy severity from 1 to 3' });
    }
    if (!details?.trim() || details.trim().length > 2000) {
      return res.status(400).json({ message: 'Provide details (up to 2000 characters)' });
    }

    const [student, classData] = await Promise.all([
      User.findById(req.params.studentId).select('role'),
      Class.findById(classId).select('name students status'),
    ]);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    if (!classData) return res.status(404).json({ message: 'Class not found' });
    if (classData.status !== 'active') {
      return res.status(423).json({ message: 'Warnings can only be sent for active classes' });
    }
    if (!classData.students.some((id) => id.toString() === student._id.toString())) {
      return res.status(409).json({ message: 'Student is not currently in this class' });
    }

    const issuedAt = new Date();
    const warning = await StudentWarning.create({
      student: student._id,
      class: classData._id,
      issuedBy: req.userId,
      reasonCode,
      policyLevel: Number(policyLevel),
      details: details.trim(),
      issuedAt,
      appealDeadline: new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    });
    res.status(201).json({ message: 'Warning sent to student', warning });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'student') {
      return res.status(403).json({ message: 'Only students can view student warnings' });
    }
    await finalizeExpiredStudentWarnings(req.userId);
    const warnings = await StudentWarning.find({ student: req.userId })
      .populate('class', 'name subject')
      .populate('issuedBy', 'name email')
      .sort({ issuedAt: -1 });
    res.json(warnings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:warningId/appeal', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'student') {
      return res.status(403).json({ message: 'Only students can appeal a warning' });
    }
    await finalizeExpiredStudentWarnings(req.userId);
    const message = req.body.message?.trim();
    if (!message || message.length > 3000) {
      return res.status(400).json({ message: 'Write an appeal message (up to 3000 characters)' });
    }
    const warning = await StudentWarning.findOne({ _id: req.params.warningId, student: req.userId });
    if (!warning) return res.status(404).json({ message: 'Warning not found' });
    if (warning.status !== 'pending' || warning.appealDeadline <= new Date()) {
      return res.status(409).json({ message: 'The appeal period for this warning has ended' });
    }

    warning.status = 'appealed';
    warning.appealMessage = message;
    warning.appealedAt = new Date();
    await warning.save();
    res.json({ message: 'Appeal sent to the administrator', warning });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:warningId/review', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { decision, response } = req.body;
    if (!['confirm', 'dismiss'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be confirm or dismiss' });
    }
    const warning = await StudentWarning.findById(req.params.warningId);
    if (!warning) return res.status(404).json({ message: 'Warning not found' });
    if (warning.status !== 'appealed') {
      return res.status(409).json({ message: 'Only appealed warnings can be reviewed manually' });
    }

    const adminResponse = response?.trim() || '';
    if (decision === 'dismiss') {
      warning.status = 'dismissed';
      warning.violationCounted = false;
      warning.resolvedAt = new Date();
      warning.adminResponse = adminResponse || 'Kháng cáo được chấp thuận; cảnh báo đã được gỡ.';
      await warning.save();
    } else {
      await confirmStudentWarning(warning._id, adminResponse || 'Kháng cáo bị từ chối; cảnh báo được xác nhận.');
    }

    const reviewed = await StudentWarning.findById(warning._id)
      .populate('student', 'name email disciplinarySanctions classRemovalIncidents suspendedUntil permanentlyBanned')
      .populate('class', 'name subject');
    res.json({ message: decision === 'confirm' ? 'Warning confirmed' : 'Warning dismissed', warning: reviewed });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;