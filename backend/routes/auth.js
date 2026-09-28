const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email và mật khẩu' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email này đã được đăng ký' });
    }

    // Create new user (public register: chỉ teacher/student, không cho tự đăng ký admin)
    const user = new User({
      name,
      email,
      password,
      role: ['teacher', 'student'].includes(role) ? role : 'student',
    });

    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Register failed:', error?.message || error);
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ: ' + error.message });
    }
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Đăng nhập admin tĩnh qua env (không cần seed, không cần tạo trước):
    // đúng ADMIN_EMAIL + ADMIN_PASSWORD là vào được, backend tự tạo/cập nhật record.
    if (
      process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD &&
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      let adminUser = await User.findOne({ email });
      if (!adminUser) {
        adminUser = new User({
          name: process.env.ADMIN_NAME || 'Quản trị viên',
          email,
          password,
          role: 'admin',
        });
        await adminUser.save();
      } else {
        let changed = false;
        if (adminUser.role !== 'admin') {
          adminUser.role = 'admin';
          changed = true;
        }
        // Đồng bộ password theo env để env luôn là nguồn đúng duy nhất
        if (!(await adminUser.comparePassword(password))) {
          adminUser.password = password;
          changed = true;
        }
        if (process.env.ADMIN_NAME && adminUser.name !== process.env.ADMIN_NAME) {
          adminUser.name = process.env.ADMIN_NAME;
          changed = true;
        }
        if (changed) await adminUser.save();
      }

      const token = jwt.sign(
        { userId: adminUser._id, role: 'admin' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: 'admin',
        },
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
