const Class = require('../models/Class');
const StudentWarning = require('../models/StudentWarning');
const User = require('../models/User');

const confirmStudentWarning = async (warningId, adminResponse = '') => {
  const warning = await StudentWarning.findOneAndUpdate(
    { _id: warningId, status: { $in: ['pending', 'appealed'] }, violationCounted: false },
    {
      $set: {
        status: 'confirmed',
        violationCounted: true,
        resolvedAt: new Date(),
        adminResponse,
      },
    },
    { new: true }
  );
  if (!warning) return StudentWarning.findById(warningId);

  const classWarningCount = await StudentWarning.countDocuments({
    student: warning.student,
    class: warning.class,
    violationCounted: true,
  });
  warning.classWarningCount = classWarningCount;

  if (classWarningCount >= 3 && !warning.classRemovalApplied) {
    const classData = await Class.findById(warning.class);
    const student = await User.findById(warning.student);
    if (classData && student) {
      classData.students.pull(student._id);
      student.enrolledClasses.pull(classData._id);
      student.classRemovalIncidents = (student.classRemovalIncidents || 0) + 1;

      if (student.classRemovalIncidents >= 2) {
        student.disciplinarySanctions = (student.disciplinarySanctions || 0) + 1;
        if (student.disciplinarySanctions === 1) {
          student.suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          warning.accountSanction = 'suspension_7_days';
        } else if (student.disciplinarySanctions === 2) {
          student.suspendedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          warning.accountSanction = 'suspension_1_month';
        } else {
          student.permanentlyBanned = true;
          student.suspendedUntil = null;
          warning.accountSanction = 'permanent_ban';
        }
      }

      warning.classRemovalApplied = true;
      await Promise.all([classData.save(), student.save()]);
    }
  }

  await warning.save();
  return warning;
};

const finalizeExpiredStudentWarnings = async (studentId) => {
  const now = new Date();
  const filter = {
    status: 'pending',
    appealDeadline: { $lte: now },
  };
  if (studentId) filter.student = studentId;
  const expiredWarnings = await StudentWarning.find(filter).select('_id');
  for (const warning of expiredWarnings) {
    await confirmStudentWarning(warning._id, 'Kháng cáo không được gửi trong thời hạn 7 ngày.');
  }
};

module.exports = { confirmStudentWarning, finalizeExpiredStudentWarnings };