const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const classAvailability = require('../middleware/classAvailability');
const Announcement = require('../models/Announcement');
const { readPage } = require('../utils/pagination');

const router = express.Router();
// Lọc hồ sơ giáo viên trong thông báo theo quyền người xem trước khi gửi JSON.
router.use(require('../middleware/userPrivacy'));
const { USER_POPULATE_FIELDS } = require('../utils/userPrivacy');

// Create announcement (teacher only)
router.post('/', authMiddleware, classAvailability(Announcement), teacherOnly, async (req, res) => {
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
    res.status(201).json({ message: 'Đã tạo thông báo', announcement });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get announcements for a class
router.get('/class/:classId', authMiddleware, classAvailability(Announcement), async (req, res) => {
  try {
    // Giao diện danh sách không dùng hồ sơ giáo viên/readBy nên không populate hoặc tải chúng.
    res.json(await readPage(Announcement, req, { class: req.params.classId }, {
      select: 'title content class teacher priority createdAt updatedAt',
    }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get announcement by ID
router.get('/:id', authMiddleware, classAvailability(Announcement), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id).populate('teacher', USER_POPULATE_FIELDS);

    if (!announcement) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    res.json(announcement);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark announcement as read
router.post('/:id/read', authMiddleware, classAvailability(Announcement), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
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

    res.json({ message: 'Đã đánh dấu thông báo là đã đọc' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update announcement (teacher only)
router.put('/:id', authMiddleware, classAvailability(Announcement), teacherOnly, async (req, res) => {
  try {
    const { title, content, priority } = req.body;
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    if (req.userRole !== 'admin' && announcement.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }

    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (priority) announcement.priority = priority;

    announcement.updatedAt = new Date();
    await announcement.save();

    res.json({ message: 'Đã cập nhật thông báo' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete announcement (teacher only)
router.delete('/:id', authMiddleware, classAvailability(Announcement), teacherOnly, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ message: 'Không tìm thấy thông báo' });
    }

    if (announcement.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }

    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa thông báo' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
