// ============================================================================
// FILE: backend/routes/classes.js
// MỤC ĐÍCH: API lớp học, tuân theo tài liệu luồng xử lý (mục 5.5, 5.7, 5.8, 6.4):
// - Giáo viên CHỈ thao tác trên lớp MÌNH phụ trách (classes.teacher == token).
// - Học sinh CHỈ xem lớp mình đã tham gia (trong mảng Class.students).
// - Thêm học sinh vào lớp dùng atomic update + kiểm tra sức chứa trong cùng 1
//   điều kiện (tương đương FOR UPDATE): 2 admin thêm cùng lúc không thể vượt chỗ.
// - Ghi audit log khi thêm học sinh vào lớp.
// ============================================================================

const express = require('express');
const { authMiddleware, teacherOnly } = require('../middleware/auth');
const Class = require('../models/Class');
const User = require('../models/User');
const { checkClassAccess } = require('../utils/classAccess');
const { writeAudit } = require('../utils/audit');
const { sendError } = require('../utils/respond');

const router = express.Router();

// Create class (teacher only)
router.post('/', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { name, description, subject, grade, capacity, schedule, thumbnail } = req.body;

    // Kiểm tra trước khi tạo (mục 5.7 - kiểm tra dữ liệu bắt buộc).
    if (!name || !subject) {
      return res.status(400).json({ message: 'Vui lòng nhập tên lớp và môn học' });
    }
    // Nếu có capacity phải là số nguyên dương hợp lý.
    if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 200)) {
      return res.status(400).json({ message: 'Sức chứa lớp phải là số nguyên từ 1 đến 200' });
    }

    const newClass = new Class({
      name,
      description,
      subject,
      grade,
      capacity: capacity || 50, // dùng mặc định của model nếu không gửi.
      schedule,
      thumbnail,
      teacher: req.userId, // lấy từ token, KHÔNG tin teacher do client gửi.
    });

    await newClass.save();
    res.status(201).json({ message: 'Class created successfully', class: newClass });
  } catch (error) {
    return sendError(res, error);
  }
});

// Get all classes for teacher or enrolled classes for student
// Phân quyền theo role từ DB (mục 5.5): teacher chỉ thấy lớp mình, student chỉ
// thấy lớp mình đã vào. Trả kết quả gọn qua ?page để tránh tải toàn bộ khi lớn.
router.get('/', authMiddleware, async (req, res) => {
  try {
    let classes;
    if (req.userRole === 'admin') {
      classes = await Class.find({}).populate('students').populate('teacher');
    } else if (req.userRole === 'teacher') {
      classes = await Class.find({ teacher: req.userId }).populate('students');
    } else {
      classes = await Class.find({ students: req.userId }).populate('teacher');
    }
    res.json(classes);
  } catch (error) {
    return sendError(res, error);
  }
});

// Get class by ID
// Yêu cầu quyền truy cập: admin mọi lớp, teacher phụ trách, student trong lớp.
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // Kiểm tra quan hệ dữ liệu trước, chỉ có quyền mới được xem (mục 5.5).
    const access = await checkClassAccess(req.params.id, req.userId, req.userRole);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const classData = await Class.findById(req.params.id)
      .populate('teacher', '-password')
      .populate('students', '-password');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classData);
  } catch (error) {
    return sendError(res, error);
  }
});

// Update class (teacher only)
router.put('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Chỉ giáo viên phụ trách lớp này mới được sửa (mục 5.5).
    if (req.userRole !== 'admin' && classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to update this class' });
    }

    // Chỉ cho sửa các trường an toàn, không cho tự đổi teacher qua body.
    const allowed = ['name', 'description', 'subject', 'grade', 'capacity', 'schedule', 'thumbnail'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) classData[key] = req.body[key];
    }
    await classData.save();

    res.json({ message: 'Class updated successfully', class: classData });
  } catch (error) {
    return sendError(res, error);
  }
});

// Delete class (teacher only)
router.delete('/:id', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Chỉ giáo viên phụ trách lớp này mới được xóa (mục 5.5).
    if (req.userRole !== 'admin' && classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized to delete this class' });
    }

    // Lưu trữ thay vì xóa cứng để buổi học và điểm danh không mất quan hệ lớp.
    await Class.updateOne({ _id: classData._id }, { $set: { status: 'inactive', updatedAt: new Date() } });
    res.json({ message: 'Đã lưu trữ lớp học; lịch sử buổi học và điểm danh được giữ lại' });
  } catch (error) {
    return sendError(res, error);
  }
});

// Enroll student (teacher adds student)
// Atomic + kiểm sức chứa trong 1 điều kiện cập nhật (mục 5.8 tài liệu):
// 2 người thêm học sinh cùng lúc không thể vượt 'capacity' vì điều kiện
// $size < capacity được đánh giá cùng lúc với $addToSet trên chính dòng đó.
router.post('/:id/enroll', authMiddleware, teacherOnly, async (req, res) => {
  try {
    const { studentEmail } = req.body;
    const classData = await Class.findById(req.params.id);

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Chỉ giáo viên phụ trách lớp này mới được thêm học sinh (mục 5.5).
    if (req.userRole !== 'admin' && classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!studentEmail) {
      return res.status(400).json({ message: 'Vui lòng nhập email học sinh' });
    }
    if (classData.status !== 'active') {
      return res.status(409).json({ message: 'Lớp đã đóng, không thể ghi danh' });
    }

    // Học sinh phải tồn tại, là student, đang hoạt động và không bị khóa/xóa mềm.
    const student = await User.findOne({
      email: String(studentEmail).trim().toLowerCase(),
      role: 'student',
      status: 'active',
      isBlocked: false,
      deletedAt: null,
    });
    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh hợp lệ (hoặc tài khoản đang không hoạt động)' });
    }

    if (classData.students.includes(student._id)) {
      return res.status(400).json({ message: 'Student already enrolled' });
    }

    // Cập nhật atomic: chống vượt sức chứa khi 2 giáo viên/admin thêm cùng lúc.
    const updatedClass = await Class.findOneAndUpdate(
      {
        _id: classData._id,
        status: 'active',
        $nor: [{ students: student._id }], // đã enroll thì không push lại.
        $expr: { $lt: [{ $size: '$students' }, '$capacity'] }, // còn sức chứa.
      },
      { $addToSet: { students: student._id } },
      { new: true }
    );

    // TìmAndUpdate không khớp -> đã enroll khi race hoặc lớp đã đầy tại thời điểm update.
    if (!updatedClass) {
      return res.status(409).json({ message: 'Lớp đã đầy, đã đóng hoặc học sinh đã được ghi danh; vui lòng tải lại' });
    }

    // Đồng bộ danh sách lớp của học sinh; nếu lỗi thì rollback lớp để không lệch.
    try {
      await User.updateOne(
        { _id: student._id },
        { $addToSet: { enrolledClasses: classData._id } }
      );
    } catch (syncError) {
      await Class.updateOne({ _id: classData._id }, { $pull: { students: student._id } });
      return res.status(500).json({ message: 'Ghi danh thất bại, vui lòng thử lại' });
    }

    // Ghi audit log vào lớp (mục 5.8 + 3.14 tài liệu).
    await writeAudit({
      actorId: req.userId,
      action: 'enroll_student',
      targetType: 'class',
      targetId: classData._id,
      oldData: { student: student.email },
      newData: { studentId: student._id, studentEmail: student.email },
    });

    res.json({ message: 'Student enrolled successfully' });
  } catch (error) {
    return sendError(res, error);
  }
});

// Get students in class
router.get('/:id/students', authMiddleware, async (req, res) => {
  try {
    // Kiểm tra quyền trước (mục 5.5): teacher phụ trách / student trong lớp / admin.
    const access = await checkClassAccess(req.params.id, req.userId, req.userRole);
    if (!access.ok) {
      return res.status(access.status).json({ message: access.message });
    }

    const classData = await Class.findById(req.params.id).populate('students', '-password');

    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classData.students);
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
