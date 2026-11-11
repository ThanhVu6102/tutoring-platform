const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const classAvailability = require('../middleware/classAvailability');
const Video = require('../models/Video');
const { readPage } = require('../utils/pagination');

const router = express.Router();
// Ẩn dữ liệu cá nhân của giáo viên trong response video đối với người khác.
router.use(require('../middleware/userPrivacy'));
const { USER_POPULATE_FIELDS } = require('../utils/userPrivacy');

const getYoutubeThumbnail = (videoUrl) => {
  try {
    const parsedUrl = new URL(videoUrl);
    const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    let videoId = '';
    if (host === 'youtu.be') videoId = parsedUrl.pathname.slice(1).split('/')[0];
    if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      videoId = parsedUrl.searchParams.get('v') || parsedUrl.pathname.split('/').filter(Boolean).pop();
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(videoId)
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : null;
  } catch (_) {
    return null;
  }
};

// Upload video (teacher only)
router.post('/', authMiddleware, classAvailability(Video), teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, videoUrl, duration, thumbnail } = req.body;
    let parsedUrl;
    try {
      parsedUrl = new URL(videoUrl);
    } catch (_) {
      return res.status(400).json({ message: 'Đường dẫn video không hợp lệ' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ message: 'Đường dẫn video phải dùng HTTP hoặc HTTPS' });
    }

    const video = new Video({
      title,
      description,
      class: classId,
      teacher: req.userId,
      videoUrl,
      duration,
      thumbnail: getYoutubeThumbnail(videoUrl) || thumbnail || null,
    });

    await video.save();
    res.status(201).json({ message: 'Đã đăng video', video });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get videos for a class
router.get('/class/:classId', authMiddleware, classAvailability(Video), async (req, res) => {
  try {
    // Danh sách chỉ lấy metadata thẻ video, không tải lịch sử người đã xem.
    res.json(await readPage(Video, req, { class: req.params.classId }, {
      select: 'title description class teacher videoUrl duration thumbnail views uploadedAt',
      sort: { uploadedAt: -1, _id: -1 },
    }));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
});

// Get video by ID
router.get('/:id', authMiddleware, classAvailability(Video), async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('teacher', USER_POPULATE_FIELDS);

    if (!video) {
      return res.status(404).json({ message: 'Không tìm thấy video' });
    }

    res.json(video);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark video as viewed
router.post('/:id/view', authMiddleware, classAvailability(Video), async (req, res) => {
  try {
    const { duration } = req.body;
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ message: 'Không tìm thấy video' });
    }

    const existingView = video.viewedBy.findIndex(
      v => v.student.toString() === req.userId
    );

    if (existingView !== -1) {
      video.viewedBy[existingView].viewedAt = new Date();
      video.viewedBy[existingView].duration = duration;
    } else {
      video.viewedBy.push({
        student: req.userId,
        viewedAt: new Date(),
        duration,
      });
      video.views += 1;
    }

    await video.save();
    res.json({ message: 'Đã ghi nhận lượt xem' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete video (teacher only)
router.delete('/:id', authMiddleware, classAvailability(Video), teacherOnly, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ message: 'Không tìm thấy video' });
    }

    if (req.userRole !== 'admin' && video.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này' });
    }

    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa video' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
