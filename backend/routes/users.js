const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('enrolledClasses');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, avatar, bio, phone } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (avatar) user.avatar = avatar;
    if (bio) user.bio = bio;
    if (phone) user.phone = phone;

    user.updatedAt = new Date();
    await user.save();

    res.json({ message: 'Profile updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
