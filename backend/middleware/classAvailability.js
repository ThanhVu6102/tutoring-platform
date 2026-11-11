const Class = require('../models/Class');

const classAvailability = (resourceModel) => async (req, res, next) => {
  if (req.userRole === 'admin') return next();

  try {
    let classId = req.params.classId;
    const resourceId = req.params.id || req.params.quizId;

    if (resourceId) {
      const resource = await resourceModel.findById(resourceId).select('class');
      const resourceClassId = resource?.class?.toString();
      const requestedClassId = req.body?.classId?.toString();
      if (resourceClassId && requestedClassId && requestedClassId !== resourceClassId) {
        return res.status(403).json({ message: 'Nội dung không thuộc lớp học này' });
      }
      classId = resourceClassId || classId;
    }
    if (!classId) classId = req.body?.classId;

    if (!classId) return next();

    const classData = await Class.findById(classId).select('status students teacher');
    if (!classData) return next();

    if (req.userRole === 'teacher' && classData.teacher.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập lớp học này' });
    }
    if (req.userRole === 'student' && !classData.students.some((studentId) => studentId.toString() === req.userId)) {
      return res.status(403).json({ message: 'Vui lòng tham gia lớp trước khi xem nội dung' });
    }
    if (classData.status === 'inactive') {
      return res.status(423).json({ message: 'Lớp học này đã bị quản trị viên khóa' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = classAvailability;
