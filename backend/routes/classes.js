const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Class = require('../models/Class');
const User = require('../models/User');

const router = express.Router();

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
    });

    await newClass.save();
    res.status(201).json({ message: 'Class created successfully', class: newClass });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all classes for teacher or enrolled classes for student
router.get('/', authMiddleware, async (req, res) => {
  try {
    let classes;
    if (req.userRole === 'teacher') {
      classes = await Class.find({ teacher: req.userId }).populate('students');
    } else {
      classes = await Class.find({ students: req.userId }).populate('teacher');
    }
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get class by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id)
      .populate('teacher')
      .populate('students');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classData);
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

    if (classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to update this class' });
    }

    Object.assign(classData, req.body);
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

    if (classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const student = await User.findOne({ email: studentEmail });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (classData.students.includes(student._id)) {
      return res.status(400).json({ message: 'Student already enrolled' });
    }

    if (classData.students.length >= classData.capacity) {
      return res.status(400).json({ message: 'Class is full' });
    }

    classData.students.push(student._id);
    student.enrolledClasses.push(classData._id);

    await classData.save();
    await student.save();

    res.json({ message: 'Student enrolled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get students in class
router.get('/:id/students', authMiddleware, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id).populate('students');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classData.students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
