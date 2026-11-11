const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const classAvailability = require('../middleware/classAvailability');
const Assignment = require('../models/Assignment');
const { readPage } = require('../utils/pagination');

const router = express.Router();
// Lọc hồ sơ giáo viên/học sinh lồng trong bài tập, không thay đổi quyền truy cập bài.
router.use(require('../middleware/userPrivacy'));
const { USER_POPULATE_FIELDS } = require('../utils/userPrivacy');

// Create assignment (teacher only)
router.post('/', authMiddleware, classAvailability(Assignment), teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, dueDate, totalPoints } = req.body;

    const assignment = new Assignment({
      title,
      description,
      class: classId,
      teacher: req.userId,
      dueDate,
      totalPoints,
    });

    await assignment.save();
    res.status(201).json({ message: 'Đã tạo bài tập', assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get assignments for a class
router.get('/class/:classId', authMiddleware, classAvailability(Assignment), async (req, res) => {
  try {
    // Thẻ bài tập không cần toàn bộ bài nộp của học sinh.
    res.json(await readPage(Assignment, req, { class: req.params.classId }, {
      select: 'title description class teacher dueDate totalPoints createdAt',
      sort: { dueDate: 1, _id: 1 },
    }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get assignment by ID
router.get('/:id', authMiddleware, classAvailability(Assignment), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('teacher', USER_POPULATE_FIELDS);

    if (!assignment) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit assignment
router.post('/:id/submit', authMiddleware, classAvailability(Assignment), async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    const existingSubmission = assignment.submissions.find(
      s => s.student.toString() === req.userId
    );

    const isLate = new Date() > new Date(assignment.dueDate);

    if (existingSubmission) {
      existingSubmission.fileUrl = fileUrl;
      existingSubmission.submittedAt = new Date();
      existingSubmission.isLate = isLate;
    } else {
      assignment.submissions.push({
        student: req.userId,
        fileUrl,
        submittedAt: new Date(),
        isLate,
      });
    }

    await assignment.save();
    res.json({ message: 'Đã nộp bài tập' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Grade assignment submission
router.post('/:id/grade', authMiddleware, classAvailability(Assignment), teacherOnly, async (req, res) => {
  try {
    const { studentId, score, feedback } = req.body;
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    }

    const submission = assignment.submissions.find(
      s => s.student.toString() === studentId
    );

    if (submission) {
      submission.score = score;
      submission.feedback = feedback;
      submission.gradedAt = new Date();
    }

    await assignment.save();
    res.json({ message: 'Đã chấm điểm bài tập' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', authMiddleware, classAvailability(Assignment), teacherOnly, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Không tìm thấy bài tập' });
    if (req.userRole !== 'admin' && assignment.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }

    await Assignment.deleteOne({ _id: assignment._id });
    res.json({ message: 'Đã xóa bài tập' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
