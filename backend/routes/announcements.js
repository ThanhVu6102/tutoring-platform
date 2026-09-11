const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Announcement = require('../models/Announcement');

const router = express.Router();

// Create announcement (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { title, content, classId, priority } = req.body;

    const announcement = new Announcement({
      title,
      content,
      class: classId,
      teacher: req.userId,
      priority,
    });

    await announcement.save();
    res.status(201).json({ message: 'Announcement created successfully', announcement });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get announcements for a class
router.get('/class/:classId', authMiddleware, async (req, res) => {
  try {
    const announcements = await Announcement.find({ class: req.params.classId })
      .populate('teacher')
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get announcement by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id).populate('teacher');

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark announcement as read
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    const alreadyRead = announcement.readBy.find(
      r => r.student.toString() === req.userId
    );

    if (!alreadyRead) {
      announcement.readBy.push({
        student: req.userId,
        readAt: new Date(),
      });
      await announcement.save();
    }

    res.json({ message: 'Announcement marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update announcement (teacher only)
router.put('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { title, content, priority } = req.body;
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    if (announcement.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (priority) announcement.priority = priority;

    announcement.updatedAt = new Date();
    await announcement.save();

    res.json({ message: 'Announcement updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete announcement (teacher only)
router.delete('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    if (announcement.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
