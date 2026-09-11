const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Assignment = require('../models/Assignment');

const router = express.Router();

// Create assignment (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
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
    res.status(201).json({ message: 'Assignment created successfully', assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get assignments for a class
router.get('/class/:classId', authMiddleware, async (req, res) => {
  try {
    const assignments = await Assignment.find({ class: req.params.classId });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get assignment by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate('teacher');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit assignment
router.post('/:id/submit', authMiddleware, async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
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
    res.json({ message: 'Assignment submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Grade assignment submission
router.post('/:id/grade', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { studentId, score, feedback } = req.body;
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
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
    res.json({ message: 'Assignment graded successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
