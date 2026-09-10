const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Video = require('../models/Video');

const router = express.Router();

// Upload video (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, videoUrl, duration, thumbnail } = req.body;

    const video = new Video({
      title,
      description,
      class: classId,
      teacher: req.userId,
      videoUrl,
      duration,
      thumbnail,
    });

    await video.save();
    res.status(201).json({ message: 'Video uploaded successfully', video });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get videos for a class
router.get('/class/:classId', authMiddleware, async (req, res) => {
  try {
    const videos = await Video.find({ class: req.params.classId });
    res.json(videos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get video by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('teacher');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    res.json(video);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark video as viewed
router.post('/:id/view', authMiddleware, async (req, res) => {
  try {
    const { duration } = req.body;
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
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
    res.json({ message: 'View recorded' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete video (teacher only)
router.delete('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    if (video.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
