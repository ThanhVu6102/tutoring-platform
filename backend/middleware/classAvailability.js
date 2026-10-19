const Class = require('../models/Class');

const classAvailability = (resourceModel) => async (req, res, next) => {
  if (req.userRole === 'admin') return next();

  try {
    let classId = req.params.classId || req.body?.classId;
    const resourceId = req.params.id || req.params.quizId;

    if (!classId && resourceId) {
      const resource = await resourceModel.findById(resourceId).select('class');
      classId = resource?.class;
    }

    if (!classId) return next();

    const classData = await Class.findById(classId).select('status');
    if (classData?.status === 'inactive') {
      return res.status(423).json({ message: 'This class is locked by an administrator' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = classAvailability;