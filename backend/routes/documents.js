const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Document = require('../models/Document');

const router = express.Router();

// Upload document (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { title, description, classId, fileUrl, fileType, fileSize } = req.body;

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
    res.status(201).json({ message: 'Document uploaded successfully', document });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get documents for a class
router.get('/class/:classId', authMiddleware, async (req, res) => {
  try {
    const documents = await Document.find({ class: req.params.classId });
    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get document by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id).populate('teacher');

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Record download
router.post('/:id/download', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    document.downloads += 1;
    await document.save();

    res.json({ message: 'Download recorded' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete document (teacher only)
router.delete('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
