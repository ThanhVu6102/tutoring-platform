const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const classAvailability = require('../middleware/classAvailability');
const Document = require('../models/Document');
const { readPage } = require('../utils/pagination');

const router = express.Router();
// Chỉ trả thông tin hồ sơ giáo viên mà người xem được phép nhận trong tài liệu.
router.use(require('../middleware/userPrivacy'));
const { USER_POPULATE_FIELDS } = require('../utils/userPrivacy');

// Upload document (teacher only)
router.post('/', authMiddleware, classAvailability(Document), teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, fileUrl, fileType, fileSize } = req.body;
    let parsedUrl;
    try {
      parsedUrl = new URL(fileUrl);
    } catch (_) {
      return res.status(400).json({ message: 'Đường dẫn tài liệu không hợp lệ' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ message: 'Đường dẫn tài liệu phải dùng HTTP hoặc HTTPS' });
    }

    const document = new Document({
      title,
      description,
      class: classId,
      teacher: req.userId,
      fileUrl,
      fileType,
      fileSize,
    });

    await document.save();
    res.status(201).json({ message: 'Đã đăng tài liệu', document });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get documents for a class
router.get('/class/:classId', authMiddleware, classAvailability(Document), async (req, res) => {
  try {
    // Không gửi lịch sử tải xuống trong response danh sách.
    res.json(await readPage(Document, req, { class: req.params.classId }, {
      select: 'title description class teacher fileUrl fileType fileSize downloads uploadedAt',
      sort: { uploadedAt: -1, _id: -1 },
    }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get document by ID
router.get('/:id', authMiddleware, classAvailability(Document), async (req, res) => {
  try {
    const document = await Document.findById(req.params.id).populate('teacher', USER_POPULATE_FIELDS);

    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Record download
router.post('/:id/download', authMiddleware, classAvailability(Document), async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }

    document.downloads += 1;
    await document.save();

    res.json({ message: 'Đã ghi nhận lượt tải' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete document (teacher only)
router.delete('/:id', authMiddleware, classAvailability(Document), teacherOnly, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }

    if (req.userRole !== 'admin' && document.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa tài liệu' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
