const express = require('express');
const crypto = require('crypto');
const { authMiddleware, teacherOnly, adminOnly } = require('../middleware/auth');
const Class = require('../models/Class');
const User = require('../models/User');

const router = express.Router();
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generateJoinCode = async () => {
  let joinCode;
  do {
    joinCode = Array.from({ length: 8 }, () =>
      JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)]
    ).join('');
  } while (await Class.exists({ joinCode }));
  return joinCode;
};

const canManageClass = (classData, req) =>
  req.userRole === 'admin' || classData.teacher.toString() === req.userId;

// Create class (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { name, description, subject, grade, capacity, schedule, thumbnail } = req.body;

    const newClass = new Class({
      name,
      description,
      subject,
      grade,
      capacity,
      schedule,
      thumbnail,
      teacher: req.userId,
      joinCode: await generateJoinCode(),
    });

    await newClass.save();
    res.status(201).json({ message: 'Class created successfully', class: newClass });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/lookup/:joinCode', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'student') {
      return res.status(403).json({ message: 'Only students can look up classes' });
    }
    const joinCode = req.params.joinCode.replace(/-/g, '').toUpperCase();
    const classData = await Class.findOne({ joinCode, status: 'active' })
      .populate('teacher', 'name email role');
    if (!classData) {
      return res.status(404).json({ message: 'Class code not found' });
    }
    if (classData.students.some((studentId) => studentId.toString() === req.userId)) {
      return res.status(409).json({ message: 'You are already in this class' });
    }
    const hasPendingRequest = classData.joinRequests.some(
      (request) => request.student.toString() === req.userId
    );
    res.json({
      _id: classData._id,
      name: classData.name,
      subject: classData.subject,
      grade: classData.grade,
      teacher: classData.teacher,
      studentCount: classData.students.length,
      capacity: classData.capacity,
      requestPending: hasPendingRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/join/:joinCode/request', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'student') {
      return res.status(403).json({ message: 'Only students can request to join classes' });
    }
    const joinCode = req.params.joinCode.replace(/-/g, '').toUpperCase();
    const classData = await Class.findOne({ joinCode, status: 'active' });
    if (!classData) {
      return res.status(404).json({ message: 'Class code not found' });
    }
    if (classData.students.some((studentId) => studentId.toString() === req.userId)) {
      return res.status(409).json({ message: 'You are already in this class' });
    }
    if (classData.students.length >= classData.capacity) {
      return res.status(409).json({ message: 'Class is full' });
    }
    if (classData.joinRequests.some((request) => request.student.toString() === req.userId)) {
      return res.status(409).json({ message: 'Your request is already pending' });
    }
    classData.joinRequests.push({ student: req.userId });
    await classData.save();
    res.status(201).json({ message: 'Join request sent', classId: classData._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/join-requests/mine', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'student') {
      return res.status(403).json({ message: 'Only students can view their join requests' });
    }
    const classes = await Class.find({ 'joinRequests.student': req.userId })
      .populate('teacher', 'name')
      .select('name subject grade teacher joinRequests');
    const requests = classes.map((classData) => ({
      _id: classData._id,
      name: classData.name,
      subject: classData.subject,
      grade: classData.grade,
      teacher: classData.teacher,
      requestedAt: classData.joinRequests.find(
        (request) => request.student.toString() === req.userId
      )?.requestedAt,
    }));
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/join-requests', authMiddleware, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id)
      .populate('joinRequests.student', 'name email');
    if (!classData) return res.status(404).json({ message: 'Class not found' });
    if (!canManageClass(classData, req)) {
      return res.status(403).json({ message: 'Not authorized to manage join requests' });
    }
    res.json(classData.joinRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/join-requests/:studentId', authMiddleware, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approve or reject' });
    }
    const classData = await Class.findById(req.params.id);
    if (!classData) return res.status(404).json({ message: 'Class not found' });
    if (!canManageClass(classData, req)) {
      return res.status(403).json({ message: 'Not authorized to manage join requests' });
    }

    const requestIndex = classData.joinRequests.findIndex(
      (request) => request.student.toString() === req.params.studentId
    );
    if (requestIndex === -1) {
      return res.status(404).json({ message: 'Join request not found' });
    }

    if (action === 'approve') {
      if (classData.status !== 'active') {
        return res.status(423).json({ message: 'This class is locked' });
      }
      if (classData.students.length >= classData.capacity) {
        return res.status(409).json({ message: 'Class is full' });
      }
      const student = await User.findOne({ _id: req.params.studentId, role: 'student' });
      if (!student) return res.status(404).json({ message: 'Student not found' });
      classData.students.addToSet(student._id);
      student.enrolledClasses.addToSet(classData._id);
      await Promise.all([classData.save(), student.save()]);
    }

    classData.joinRequests.splice(requestIndex, 1);
    await classData.save();
    res.json({ message: action === 'approve' ? 'Student approved' : 'Join request rejected' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all classes for teacher or enrolled classes for student
router.get('/', authMiddleware, async (req, res) => {
  try {
    let classes;
    if (req.userRole === 'admin') {
      classes = await Class.find({})
        .populate('students', 'name email role')
        .populate('teacher', 'name email role');
    } else if (req.userRole === 'teacher') {
      classes = await Class.find({ teacher: req.userId })
        .populate('students', 'name email role')
        .populate('joinRequests.student', 'name email');
    } else {
      classes = await Class.find({ students: req.userId, status: 'active' })
        .select('-joinCode -joinRequests')
        .populate('teacher', 'name email role');
    }
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== 'active') {
      return res.status(409).json({ message: 'Issue a lock notice before locking this class' });
    }

    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (classData.lockNotice?.status && classData.lockNotice.status !== 'none') {
      classData.lockNoticeHistory.push({
        ...classData.lockNotice.toObject(),
        status: 'dismissed',
        resolvedAt: new Date(),
        adminResponse: 'Class reopened by administrator',
      });
    }
    classData.status = 'active';
    classData.lockNotice = { status: 'none' };
    classData.updatedAt = new Date();
    await classData.save();

    res.json({ message: 'Class reopened', class: classData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/lock-notice', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { reasonCode, policyLevel, details } = req.body;
    const validReasons = [
      'spam', 'abusive_content', 'copyright', 'account_sharing', 'academic_fraud',
      'illegal_content', 'privacy_breach', 'financial_misconduct', 'class_disruption', 'other',
    ];
    if (!validReasons.includes(reasonCode)) {
      return res.status(400).json({ message: 'Select a valid policy violation reason' });
    }
    if (![1, 2, 3].includes(Number(policyLevel))) {
      return res.status(400).json({ message: 'Select a policy severity from 1 to 3' });
    }
    if (!details?.trim() || details.trim().length > 2000) {
      return res.status(400).json({ message: 'Provide details (up to 2000 characters)' });
    }

    const classData = await Class.findById(req.params.id);
    if (!classData) return res.status(404).json({ message: 'Class not found' });
    if (classData.status === 'inactive') {
      return res.status(409).json({ message: 'Reopen the class before issuing a new notice' });
    }
    if (['pending', 'appealed'].includes(classData.lockNotice?.status)) {
      return res.status(409).json({ message: 'This class already has an unresolved lock notice' });
    }

    if (classData.lockNotice?.status && classData.lockNotice.status !== 'none') {
      classData.lockNoticeHistory.push(classData.lockNotice.toObject());
    }

    const issuedAt = new Date();
    classData.lockNotice = {
      status: 'pending',
      reasonCode,
      policyLevel: Number(policyLevel),
      details: details.trim(),
      issuedAt,
      appealDeadline: new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000),
      appealMessage: '',
      appealedAt: null,
      resolvedAt: null,
      adminResponse: '',
    };
    classData.updatedAt = issuedAt;
    await classData.save();
    res.status(202).json({ message: 'Lock notice sent; appeal window is 24 hours', class: classData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/lock-appeal', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'teacher') {
      return res.status(403).json({ message: 'Only the class teacher can appeal this notice' });
    }
    const message = req.body.message?.trim();
    if (!message || message.length > 3000) {
      return res.status(400).json({ message: 'Write an appeal message (up to 3000 characters)' });
    }

    const classData = await Class.findById(req.params.id);
    if (!classData) return res.status(404).json({ message: 'Class not found' });
    if (classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to appeal this class notice' });
    }
    if (classData.lockNotice?.status !== 'pending' || classData.status !== 'active') {
      return res.status(409).json({ message: 'This notice is no longer open for appeal' });
    }
    if (classData.lockNotice.appealDeadline <= new Date()) {
      return res.status(409).json({ message: 'The 24-hour appeal window has closed' });
    }

    classData.lockNotice.status = 'appealed';
    classData.lockNotice.appealMessage = message;
    classData.lockNotice.appealedAt = new Date();
    await classData.save();
    res.json({ message: 'Appeal sent to the administrator' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/lock-review', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { decision, response } = req.body;
    if (!['lock', 'dismiss'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be lock or dismiss' });
    }
    const classData = await Class.findById(req.params.id);
    if (!classData) return res.status(404).json({ message: 'Class not found' });
    if (!['pending', 'appealed'].includes(classData.lockNotice?.status)) {
      return res.status(409).json({ message: 'There is no unresolved lock notice' });
    }
    if (
      classData.lockNotice.status === 'pending'
      && classData.lockNotice.appealDeadline > new Date()
    ) {
      return res.status(409).json({ message: 'The 24-hour appeal window is still open' });
    }

    classData.status = decision === 'lock' ? 'inactive' : 'active';
    classData.lockNotice.status = decision === 'lock' ? 'locked' : 'dismissed';
    classData.lockNotice.resolvedAt = new Date();
    classData.lockNotice.adminResponse = response?.trim() || '';
    if (decision === 'dismiss') {
      classData.lockNoticeHistory.push(classData.lockNotice.toObject());
      classData.lockNotice = { status: 'none' };
    }
    classData.updatedAt = new Date();
    await classData.save();
    res.json({ message: decision === 'lock' ? 'Class formally locked' : 'Lock notice dismissed', class: classData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get class by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id)
      .populate('teacher', 'name email role')
      .populate('students', 'name email role');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    const teacherId = classData.teacher?._id?.toString() || classData.teacher?.toString();
    if (req.userRole === 'teacher' && teacherId !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to access this class' });
    }
    if (req.userRole === 'student' && !classData.students.some((student) => student._id.toString() === req.userId)) {
      return res.status(403).json({ message: 'Join this class before accessing its content' });
    }
    if (classData.status === 'inactive' && req.userRole === 'student') {
      return res.status(423).json({ message: 'This class is locked by an administrator' });
    }

    if (!classData.joinCode && req.userRole !== 'student') {
      classData.joinCode = await generateJoinCode();
      await classData.save();
    }

    const responseData = classData.toObject();
    if (req.userRole === 'student') {
      delete responseData.joinCode;
      delete responseData.joinRequests;
    }
    res.json(responseData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update class (teacher only)
router.put('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (classData.status === 'inactive') {
      return res.status(423).json({ message: 'This class is locked by an administrator' });
    }

    if (classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to update this class' });
    }

    const editableFields = ['name', 'description', 'subject', 'grade', 'capacity', 'schedule', 'thumbnail'];
    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) classData[field] = req.body[field];
    });
    await classData.save();

    res.json({ message: 'Class updated successfully', class: classData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete class (teacher only)
router.delete('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (classData.status === 'inactive') {
      return res.status(423).json({ message: 'This class is locked by an administrator' });
    }

    if (classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this class' });
    }

    await Class.findByIdAndDelete(req.params.id);
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Enroll student (teacher adds student)
router.post('/:id/enroll', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { studentEmail } = req.body;
    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (classData.status === 'inactive') {
      return res.status(423).json({ message: 'This class is locked by an administrator' });
    }

    if (classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const student = await User.findOne({ email: studentEmail, role: 'student' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (classData.students.some((studentId) => studentId.toString() === student._id.toString())) {
      return res.status(400).json({ message: 'Student already enrolled' });
    }

    if (classData.students.length >= classData.capacity) {
      return res.status(400).json({ message: 'Class is full' });
    }

    classData.students.addToSet(student._id);
    classData.joinRequests = classData.joinRequests.filter(
      (request) => request.student.toString() !== student._id.toString()
    );
    student.enrolledClasses.addToSet(classData._id);

    await Promise.all([classData.save(), student.save()]);

    res.json({ message: 'Student enrolled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get students in class
router.get('/:id/students', authMiddleware, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id).populate('students', 'name email role');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (req.userRole !== 'admin' && (req.userRole !== 'teacher' || classData.teacher.toString() !== req.userId)) {
      return res.status(403).json({ message: 'Not authorized to view class students' });
    }

    if (classData.status === 'inactive' && req.userRole === 'student') {
      return res.status(423).json({ message: 'This class is locked by an administrator' });
    }

    res.json(classData.students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
