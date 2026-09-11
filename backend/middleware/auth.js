const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const teacherOnly = (req, res, next) => {
  if (req.userRole !== 'teacher') {
    return res.status(403).json({ message: 'Only teachers can access this' });
  }
  next();
};

module.exports = { authMiddleware, teacherOnly };
